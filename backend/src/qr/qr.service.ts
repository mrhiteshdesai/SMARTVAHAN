import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditService } from '../audit/audit.service';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private auditService: AuditService
  ) {}

  async generateBatch(data: any, userId: string, baseUrl: string) {
    try {
        const { stateCode, oemCode, productCode, quantity, pcBindingId } = data;
        
        // --- 1. Validate Input (BUG-QR-001, BUG-QR-002, BUG-QR-003) ---
        if (!stateCode || !oemCode || !productCode || !quantity) {
            throw new BadRequestException('Missing required fields: stateCode, oemCode, productCode, quantity');
        }

        const qty = Number(quantity);
        if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
            throw new BadRequestException('Quantity must be a positive integer');
        }

        // Hard limit to prevent DoS (BUG-QR-002)
        if (qty > 1000) {
            throw new BadRequestException('Maximum quantity per batch is 1000');
        }

        // Validate existence
        const state = await this.prisma.state.findUnique({ where: { code: stateCode } });
        const oem = await this.prisma.oEM.findUnique({ where: { code: oemCode } });
        const product = await this.prisma.product.findUnique({ where: { code: productCode } });

        if (!state || !oem || !product) {
          throw new BadRequestException('Invalid State, OEM or Product code');
        }

        // Validate OEM Authorization for the State
        if (!oem.authorizedStates.includes(stateCode)) {
             throw new BadRequestException(`OEM ${oem.name} is not authorized for state ${state.name} (${stateCode})`);
        }

        let batchId = data.batchId || this.generateBatchId();
        let retries = 0;
        while ((await this.prisma.batch.findUnique({ where: { batchId } })) && retries < 5) {
          if (!data.batchId) {
            batchId = this.generateBatchId();
            retries++;
          } else {
            throw new BadRequestException('Batch ID already exists');
          }
        }
        if (retries >= 5) throw new Error('Failed to generate unique Batch ID');

        // Create Pending Batch Record
        const batch = await this.prisma.batch.create({
            data: {
              batchId,
              userId,
              pcBindingId,
              stateCode,
              oemCode,
              productCode,
              quantity,
              status: 'PENDING',
              filePath: '', // Placeholder
              isGhost: false // Default
            }
        });

        // Audit Log for Batch Generation
        await this.auditService.logAction(
            userId,
            'GENERATE_BATCH',
            'BATCH',
            batchId,
            `Generated batch of ${quantity} QR codes for ${stateCode}-${oemCode}-${productCode}`
        );

        // Trigger Async Processing (Fire and forget, but catch errors inside)
        this.processBatch(batch.id, data, batchId, baseUrl, false).catch(err => {
            this.logger.error(`Async batch processing failed for ${batchId}`, err);
            this.prisma.batch.update({
                where: { id: batch.id },
                data: { status: 'FAILED' }
            }).catch(e => this.logger.error('Failed to update batch status to FAILED', e));
        });

        return batch;

    } catch (error) {
        this.logger.error('Error generating batch:', error);
        throw error;
    }
  }

  private async processBatch(dbId: string, data: any, batchId: string, baseUrl: string, isGhost: boolean, ghostConfig?: { startSerial?: string, specificSerials?: number[] }) {
      const { stateCode, oemCode, productCode, quantity } = data;
      
      // Update Status to PROCESSING
      await this.prisma.batch.update({
          where: { id: dbId },
          data: { status: 'PROCESSING' }
      });

      let startIteration: number;

      if (isGhost) {
        // Ghost Mode: Use provided serials
        if (ghostConfig?.specificSerials) {
            startIteration = ghostConfig.specificSerials[0];
        } else if (ghostConfig?.startSerial) {
             startIteration = parseInt(ghostConfig.startSerial);
             if (isNaN(startIteration)) throw new Error("Invalid Start Serial Number");
        } else {
             throw new Error("Start Serial or Specific Serials required for Ghost Batch");
        }

      } else {
        // Normal Mode: Increment Sequence
        const sequenceId = `QR_SEQ_${stateCode}_${oemCode}`;
        
        // Use upsert for atomic operation (BUG-QR-004)
        const sequence = await this.prisma.sequence.upsert({
            where: { id: sequenceId },
            create: { id: sequenceId, value: 1000 + quantity },
            update: { value: { increment: quantity } }
        });
        
        startIteration = sequence.value - quantity; 
      }

      // Prepare PDF
      // 250mm = 708.66 pts, 380mm = 1077.16 pts
      // Margin = 20mm = 56.7 pts
      const width = 708.66;
      const height = 1077.16;
      const margin = 56.7;
      
      const doc = new PDFDocument({ 
          size: [width, height], 
          margins: { top: 0, bottom: 0, left: 0, right: 0 }, 
          autoFirstPage: false 
      });

      const dateObj = new Date();
      const dateYMD = dateObj.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
      const dateDMY = this.formatDateDDMMYYYY(dateObj); // DDMMYYYY
      
      const ghostPrefix = isGhost ? 'GHOST-' : '';
      const pdfName = `${ghostPrefix}${stateCode}-${oemCode}-${productCode}-${quantity}-${dateDMY}-${batchId}.pdf`;
      
      // Directory: uploads/QR/{STATE}/{BRAND}
      // If Ghost, maybe separate folder? Or same?
      // Requirement: "Ghost Batches... cleanest way to manage them in database".
      // Let's keep in same folder structure for simplicity, file name has batchId which is unique.
      const baseDir = path.join(process.cwd(), 'uploads', 'QR', stateCode, oemCode);
      
      if (!fs.existsSync(baseDir)) {
           fs.mkdirSync(baseDir, { recursive: true });
      }
      
      const filePath = path.join(baseDir, pdfName);
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const qrRecords = [];
      let startSerialStr = '';
      let endSerialStr = '';

      for (let i = 0; i < quantity; i++) {
        doc.addPage();
        let serial: number;
        if (ghostConfig?.specificSerials && ghostConfig.specificSerials.length > 0) {
             // Use specific serials found in database
             if (i >= ghostConfig.specificSerials.length) {
                 // Should not happen as we updated quantity, but for safety
                 break; 
             }
             serial = ghostConfig.specificSerials[i];
        } else {
             // Sequential generation (Standard or Ghost fallback)
             serial = startIteration + i;
        }
        
        // QR Logic: a = Iteration, b = Product, c = Random
        const a = i; 
        const b = productCode;
        const c = this.generateRandomString(15);
        const qrValue = `${a}${b}${c}`;
        
        // Remove trailing slash from baseUrl if present
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const fullUrl = `${cleanBaseUrl}/${stateCode}/${oemCode}/${productCode}/qr=${qrValue}`;

        // Generate QR Image Data URL
        // Use margin: 1 to minimize white border inside the image, allowing content to be larger
        const qrDataUrl = await QRCode.toDataURL(fullUrl, { errorCorrectionLevel: 'H', margin: 1 });
        const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
        
        const usableWidth = width - (margin * 2);
        
        // --- LAYOUT ADJUSTMENTS FOR MAXIMUM SIZE ---

        // 1. Header: {STATE CODE}-{BRAND CODE}-{PRODUCT}
        // Position: Top Margin + 20pt
        // Font: 75pt Bold
        const headerY = margin + 20;
        doc.font('Helvetica-Bold').fontSize(75)
           .text(`${stateCode}-${oemCode}-${productCode}`, 0, headerY, { 
               align: 'center', 
               width: width // Center across full page width
           });
        
        // 2. QR Code Image
        // Make it as large as possible while keeping margins
        // Y Position: Below Header + Spacing
        const qrY = headerY + 100; // 75pt text + 25pt gap
        const qrSize = usableWidth; // Full width between margins (approx 600pt)
        
        doc.image(Buffer.from(base64Data, 'base64'), margin, qrY, { 
            width: qrSize, 
            height: qrSize 
        });
        
        // 3. Serial Number: 1000
        // Position: Below QR + Spacing
        // Font: 90pt Bold
        const serialY = qrY + qrSize + 30;
        doc.font('Helvetica-Bold').fontSize(90)
           .text(`${serial}`, 0, serialY, { 
               align: 'center', 
               width: width 
           });
        
        if (i === 0) startSerialStr = serial.toString();
        if (i === quantity - 1) endSerialStr = serial.toString();

        // 4. Footer Line 1: {YYYYMMDD}-{BATCHID}-(X/TOTAL)
        // Position: Just above Footer 2
        const footer2Y = height - margin - 40; // Bottom absolute anchor
        const footer1Y = footer2Y - 70;
        
        const footer1 = `${dateYMD}-${batchId}-(${i + 1}/${quantity})`;
        doc.font('Helvetica').fontSize(45)
           .text(footer1, 0, footer1Y, { 
               align: 'center', 
               width: width 
           });

        // 5. Footer Line 2: SADAK SURAKSHA JEEVAN RAKSHA
        // Position: Bottom Margin
        // Font: 30pt Bold
        doc.font('Helvetica-Bold').fontSize(30)
           .text("SADAK SURAKSHA JEEVAN RAKSHA", 0, footer2Y, { 
               align: 'center', 
               width: width 
           });
        
        qrRecords.push({
          value: qrValue,
          fullUrl,
          serialNumber: serial
        });
      }

      doc.end();

      // Wait for file to finish writing
      await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
      });

      // S3 Upload Logic
      let finalFilePath = filePath;
      const s3Key = `qr-batches/${stateCode}/${oemCode}/${pdfName}`;
      const s3Url = await this.s3Service.uploadFile(filePath, s3Key);
      
      if (s3Url) {
          finalFilePath = s3Url;
          // Delete local file to save space
          try {
              if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
              }
          } catch (e) {
              this.logger.error("Failed to delete local QR Batch PDF after S3 upload", e);
          }
      }

      // Update Batch Record with Completion Details
      await this.prisma.batch.update({
          where: { id: dbId },
          data: {
              status: 'COMPLETED',
              startSerial: startSerialStr,
              endSerial: endSerialStr,
              filePath: finalFilePath,
              qrCodes: {
                  create: qrRecords
              }
          }
      });

      // --- INVENTORY LOGGING (INWARD) ---
        // Removed: We now calculate inward stock dynamically from Batch records to support historical data
        
    }
  
  async getBatches(user: any, isGhost: boolean = false) {
      const where: any = {};
      
      // Ghost Filter
      where.isGhost = isGhost;

      if (user.role === 'STATE_ADMIN') {
          where.stateCode = user.stateCode;
      } else if (user.role === 'OEM_ADMIN') {
          where.oemCode = user.oemCode;
      }
      // ADMIN/SUPER_ADMIN see all (no filter)
      // DEALER not allowed (controlled by Guard)

      return this.prisma.batch.findMany({
          where,
          include: { state: true, oem: true, product: true },
          orderBy: { createdAt: 'desc' }
      });
  }

  async regenerateBatch(data: any, userId: string, baseUrl: string) {
    // Regenerate Logic:
    // 1. Accepts state, oem, product, startSerial, quantity
    // 2. Creates a GHOST BATCH (isGhost=true)
    // 3. Generates QR codes for USED codes starting from startSerial
    
    // Validate Input
    const { stateCode, oemCode, productCode, quantity, startSerial } = data;
    if (!stateCode || !oemCode || !productCode || !quantity || !startSerial) {
        throw new BadRequestException('Missing required fields: stateCode, oemCode, productCode, quantity, startSerial');
    }

    const qty = Number(quantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
        throw new BadRequestException('Quantity must be a positive integer');
    }

    // Validate existence
    const state = await this.prisma.state.findUnique({ where: { code: stateCode } });
    const oem = await this.prisma.oEM.findUnique({ where: { code: oemCode } });
    const product = await this.prisma.product.findUnique({ where: { code: productCode } });

    if (!state || !oem || !product) {
      throw new BadRequestException('Invalid State, OEM or Product code');
    }

    // FIND USED SERIALS
    const startSerialNum = parseInt(startSerial);
    if (isNaN(startSerialNum)) {
        throw new BadRequestException('Start Serial must be a number');
    }

    // Search for USED QR codes (status=1) in MAIN batches (isGhost=false)
    const usedQRs = await this.prisma.qRCode.findMany({
        where: {
            batch: {
                stateCode,
                oemCode,
                productCode,
                isGhost: false // Only regenerate from original batches
            },
            serialNumber: {
                gte: startSerialNum
            },
            status: 1 // USED
        },
        orderBy: {
            serialNumber: 'asc'
        },
        take: qty,
        select: {
            serialNumber: true
        }
    });

    if (usedQRs.length === 0) {
        throw new NotFoundException(`No used QR codes found starting from serial ${startSerial} for this State/OEM/Product`);
    }

    const serialsToRegenerate = usedQRs.map(q => q.serialNumber);
    const actualQty = serialsToRegenerate.length;

    // Create Ghost Batch
    let batchId = this.generateBatchId();
    // Ensure unique
    while (await this.prisma.batch.findUnique({ where: { batchId } })) {
        batchId = this.generateBatchId();
    }

    const batch = await this.prisma.batch.create({
        data: {
            batchId,
            userId,
            stateCode,
            oemCode,
            productCode,
            quantity: actualQty, // Use actual found quantity
            startSerial: serialsToRegenerate[0].toString(),
            endSerial: serialsToRegenerate[actualQty - 1].toString(),
            status: 'PENDING',
            filePath: '',
            isGhost: true // MARK AS GHOST
        }
    });

    // Audit Log
    await this.auditService.logAction(
        userId,
        'REGENERATE_BATCH',
        'BATCH',
        batchId,
        `Regenerated GHOST batch of ${actualQty} QR codes (requested ${qty}) for ${stateCode}-${oemCode}-${productCode} starting at ${startSerial}`
    );

    // Update data quantity for processBatch
    const processData = { ...data, quantity: actualQty };

    // Process Async
    this.processBatch(batch.id, processData, batchId, baseUrl, true, { specificSerials: serialsToRegenerate }).catch(err => {
        this.logger.error(`Async ghost batch processing failed for ${batchId}`, err);
        this.prisma.batch.update({
            where: { id: batch.id },
            data: { status: 'FAILED' }
        }).catch(e => this.logger.error('Failed to update batch status to FAILED', e));
    });

    return batch;
  }

  async getEligibleCountForRegenerationV2(data: any) {
    const { stateCode, oemCode, productCode, quantity, startSerial } = data;
    if (!stateCode || !oemCode || !productCode || !quantity || !startSerial) {
      throw new BadRequestException('Missing required fields: stateCode, oemCode, productCode, quantity, startSerial');
    }

    const qty = Number(quantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }

    const startSerialNum = parseInt(startSerial);
    if (isNaN(startSerialNum)) {
      throw new BadRequestException('Start Serial must be a number');
    }

    const eligible = await this.prisma.qRCode.findMany({
      where: {
        batch: {
          stateCode,
          oemCode,
          productCode,
          isGhost: false
        },
        serialNumber: { gte: startSerialNum },
        status: 1
      },
      orderBy: { serialNumber: 'asc' },
      take: qty,
      select: { serialNumber: true }
    });

    return {
      success: true,
      data: {
        eligibleCount: eligible.length,
        firstSerial: eligible.length > 0 ? eligible[0].serialNumber : null,
        lastSerial: eligible.length > 0 ? eligible[eligible.length - 1].serialNumber : null
      }
    };
  }

  async regenerateBatchV2(data: any, userId: string, baseUrl: string) {
    const { stateCode, oemCode, productCode, quantity, startSerial } = data;
    if (!stateCode || !oemCode || !productCode || !quantity || !startSerial) {
      throw new BadRequestException('Missing required fields: stateCode, oemCode, productCode, quantity, startSerial');
    }

    const qty = Number(quantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }

    const startSerialNum = parseInt(startSerial);
    if (isNaN(startSerialNum)) {
      throw new BadRequestException('Start Serial must be a number');
    }

    const state = await this.prisma.state.findUnique({ where: { code: stateCode } });
    const oem = await this.prisma.oEM.findUnique({ where: { code: oemCode } });
    const product = await this.prisma.product.findUnique({ where: { code: productCode } });
    if (!state || !oem || !product) {
      throw new BadRequestException('Invalid State, OEM or Product code');
    }

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    const eligibleQrs = await this.prisma.qRCode.findMany({
      where: {
        batch: {
          stateCode,
          oemCode,
          productCode,
          isGhost: false
        },
        serialNumber: { gte: startSerialNum },
        status: 1
      },
      include: {
        batch: true
      },
      orderBy: { serialNumber: 'asc' },
      take: qty
    });

    if (eligibleQrs.length === 0) {
      throw new NotFoundException(`No used QR codes found starting from serial ${startSerial} for this State/OEM/Product`);
    }

    let runBatchId = this.generateBatchId();
    while (await this.prisma.batch.findUnique({ where: { batchId: runBatchId } })) {
      runBatchId = this.generateBatchId();
    }
    const batch = await this.prisma.batch.create({
      data: {
        batchId: runBatchId,
        userId,
        stateCode,
        oemCode,
        productCode,
        quantity: eligibleQrs.length,
        startSerial: eligibleQrs[0].serialNumber.toString(),
        endSerial: eligibleQrs[eligibleQrs.length - 1].serialNumber.toString(),
        status: 'PROCESSING',
        filePath: '',
        isGhost: true
      }
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const updates: Array<{
        id: string;
        serialNumber: number;
        oldQrValue: string;
        newQrValue: string;
        originalBatchId: string;
        originalBatchCreatedAt: Date;
        originalBatchStartSerial: string | null;
        originalBatchQuantity: number;
      }> = [];
      const reservedValues = new Set<string>();

      for (const qr of eligibleQrs) {
        const newQrValue = await this.generateUniqueQrValueWithClient(tx, productCode, reservedValues);
        const fullUrl = `${cleanBaseUrl}/${stateCode}/${oemCode}/${productCode}/qr=${newQrValue}`;

        await tx.qRCode.update({
          where: { id: qr.id },
          data: {
            value: newQrValue,
            fullUrl,
            status: 0
          }
        });

        updates.push({
          id: qr.id,
          serialNumber: qr.serialNumber,
          oldQrValue: qr.value,
          newQrValue,
          originalBatchId: qr.batch.batchId,
          originalBatchCreatedAt: qr.batch.createdAt,
          originalBatchStartSerial: qr.batch.startSerial || null,
          originalBatchQuantity: qr.batch.quantity
        });
      }

      const run = await tx.qRRegenerationRun.create({
        data: {
          stateCode,
          oemCode,
          productCode,
          startSerial: startSerialNum,
          requestedQuantity: qty,
          eligibleCount: eligibleQrs.length,
          regeneratedCount: updates.length,
          createdBy: userId
        }
      });

      await tx.qRRegeneration.createMany({
        data: updates.map((u) => ({
          runId: run.id,
          stateCode,
          oemCode,
          productCode,
          serialNumber: u.serialNumber,
          oldQrValue: u.oldQrValue,
          newQrValue: u.newQrValue,
          regeneratedBy: userId
        }))
      });

      return { run, updates };
    });

    try {
      const { filePath, processedCount } = await this.generateGhostReprintPdfV2(
        updated.updates.map((u) => ({
          stateCode,
          oemCode,
          productCode,
          serialNumber: u.serialNumber,
          qrValue: u.newQrValue,
          originalBatchId: u.originalBatchId,
          originalBatchCreatedAt: u.originalBatchCreatedAt,
          originalBatchStartSerial: u.originalBatchStartSerial,
          originalBatchQuantity: u.originalBatchQuantity
        })),
        stateCode,
        oemCode,
        productCode,
        cleanBaseUrl,
        updated.run.id
      );

      await this.prisma.batch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          filePath,
          quantity: processedCount
        }
      });

      await this.prisma.qRRegenerationRun.update({
        where: { id: updated.run.id },
        data: { filePath }
      });
    } catch (e) {
      await this.prisma.batch.update({
        where: { id: batch.id },
        data: { status: 'FAILED' }
      });
      throw e;
    }

    await this.auditService.logAction(
      userId,
      'REGENERATE_BATCH_V2',
      'BATCH',
      runBatchId,
      `Regenerated (V2) ${eligibleQrs.length} QR codes for ${stateCode}-${oemCode}-${productCode} starting at ${startSerial}`
    );

    return {
      success: true,
      data: {
        batchId: runBatchId,
        regeneratedCount: eligibleQrs.length
      }
    };
  }

  async generateBulkReplacementPdf(serials: number[], stateCode: string, oemCode: string, baseUrl: string): Promise<{ filePath: string, count: number, skipped: number }> {
      // 1. Fetch QRs
      const qrs = await this.prisma.qRCode.findMany({
          where: {
              serialNumber: { in: serials },
              batch: {
                  stateCode: stateCode,
                  oemCode: oemCode
              }
          },
          include: {
              batch: true
          }
      });

      // 2. Filter Active (status === 0) and Sort
      const activeQrs = qrs.filter(q => q.status === 0);
      const skippedCount = serials.length - activeQrs.length;

      if (activeQrs.length === 0) {
          throw new BadRequestException('No active QR codes found matching the criteria (State/OEM/Serials) or they are already used.');
      }

      // Sort by State > OEM > Product > Serial
      activeQrs.sort((a, b) => {
          const stateCompare = a.batch.stateCode.localeCompare(b.batch.stateCode);
          if (stateCompare !== 0) return stateCompare;
          const oemCompare = a.batch.oemCode.localeCompare(b.batch.oemCode);
          if (oemCompare !== 0) return oemCompare;
          const prodCompare = a.batch.productCode.localeCompare(b.batch.productCode);
          if (prodCompare !== 0) return prodCompare;
          return a.serialNumber - b.serialNumber;
      });

      // 3. Generate PDF
      const width = 708.66;
      const height = 1077.16;
      const margin = 56.7;

      const doc = new PDFDocument({ 
          size: [width, height], 
          margins: { top: 0, bottom: 0, left: 0, right: 0 }, 
          autoFirstPage: false 
      });

      const dateObj = new Date();
      const dateDMY = this.formatDateDDMMYYYY(dateObj);
      const dateYMD = dateObj.toISOString().split('T')[0].replace(/-/g, '');
      const batchId = `REPL-${Date.now().toString().slice(-5)}`; // Short Batch ID for footer (last 5 digits)
      const fileName = `Replacement-${dateDMY}-${activeQrs.length}.pdf`;
      const filePath = path.join(process.cwd(), 'uploads', 'QR', fileName);

      // Ensure directory exists (uploads/QR is safe assumption from processBatch)
      const baseDir = path.dirname(filePath);
      if (!fs.existsSync(baseDir)) {
           fs.mkdirSync(baseDir, { recursive: true });
      }

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      for (let i = 0; i < activeQrs.length; i++) {
          const qr = activeQrs[i];
          const { stateCode, oemCode, productCode } = qr.batch;
          
          doc.addPage();

          // Generate New QR Image (Value remains same as original active QR)
          // Wait, user said "Regenerate used qr code with new value". 
          // BUT for "Bulk QR Search & Replacement", the request says: 
          // "active codes (Eliminates used code) are exported in a pdf as a replacement QR Code file."
          // This implies we are re-printing EXISTING ACTIVE codes because the sticker might be damaged.
          // So the VALUE should remain the SAME.
          
          const fullUrl = qr.fullUrl || `${baseUrl}/${stateCode}/${oemCode}/${productCode}/qr=${qr.value}`;
          // Ensure baseUrl is correct if fullUrl stored is relative or old
          // Actually, let's reconstruct fullUrl to be safe with current baseUrl
          const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          const effectiveUrl = `${cleanBaseUrl}/${stateCode}/${oemCode}/${productCode}/qr=${qr.value}`;

          const qrDataUrl = await QRCode.toDataURL(effectiveUrl, { errorCorrectionLevel: 'H', margin: 1 });
          const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
          const usableWidth = width - (margin * 2);

          // Header
          const headerY = margin + 20;
          doc.font('Helvetica-Bold').fontSize(75)
             .text(`${stateCode}-${oemCode}-${productCode}`, 0, headerY, { 
                 align: 'center', 
                 width: width 
             });

          // REPLACEMENT Badge
          // Add a clear indicator this is a replacement
          doc.save();
          const badgeWidth = 200;
          const badgeHeight = 40;
          const badgeX = (width - badgeWidth) / 2;
          const badgeY = headerY + 80; // Reduced gap from 100
          
          doc.rect(badgeX, badgeY, badgeWidth, badgeHeight).fill('#dc2626'); // Red background
          doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
             .text("REPLACEMENT", badgeX, badgeY + 10, { width: badgeWidth, align: 'center' });
          doc.restore();

          // QR Image
          const qrY = headerY + 130; // Reduced gap from 160
          const qrSize = usableWidth;
          doc.image(Buffer.from(base64Data, 'base64'), margin, qrY, { 
              width: qrSize, 
              height: qrSize 
          });

          // Serial
          const serialY = qrY + qrSize + 30;
          doc.font('Helvetica-Bold').fontSize(90)
             .text(`${qr.serialNumber}`, 0, serialY, { 
                 align: 'center', 
                 width: width 
             });

          // Footer 1
          const footer2Y = height - margin - 40;
          const footer1Y = footer2Y - 70;
          const footer1 = `${dateYMD}-${batchId}-(${i + 1}/${activeQrs.length})`;
          doc.font('Helvetica').fontSize(45)
             .text(footer1, 0, footer1Y, { 
                 align: 'center', 
                 width: width 
             });

          // Footer 2
          doc.font('Helvetica-Bold').fontSize(30)
             .text("SADAK SURAKSHA JEEVAN RAKSHA", 0, footer2Y, { 
                 align: 'center', 
                 width: width 
             });
      }

      doc.end();

      await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
      });

      return { filePath, count: activeQrs.length, skipped: skippedCount };
  }

  async getBatchFile(batchId: string, user?: any) {
      const batch = await this.prisma.batch.findUnique({ where: { batchId } });
      if (!batch) throw new NotFoundException('Batch not found');
      
      // Authorization Check
      if (user) {
          if (user.role === 'STATE_ADMIN' && batch.stateCode !== user.stateCode) {
              throw new BadRequestException('Access Denied: You cannot download batches from other states');
          }
          if (user.role === 'OEM_ADMIN' && batch.oemCode !== user.oemCode) {
              throw new BadRequestException('Access Denied: You cannot download batches for other OEMs');
          }
      }
      
      if (batch.status !== 'COMPLETED') {
          throw new BadRequestException('Batch is not ready for download');
      }

      if (batch.filePath && batch.filePath.startsWith('http')) {
           return {
               path: batch.filePath,
               filename: `${batchId}.pdf`,
               isUrl: true
           };
      }

      if (!batch.filePath || !fs.existsSync(batch.filePath)) {
          throw new NotFoundException('File not found on server');
      }
      
      return {
          path: batch.filePath,
          filename: path.basename(batch.filePath),
          isUrl: false
      };
  }

  private extractKeyFromPublicUrl(fileUrl: string): { key: string; filename: string } | null {
    try {
      const u = new URL(fileUrl);
      const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
      if (!key) return null;
      const filename = key.split('/').pop() || 'file';
      return { key, filename };
    } catch {
      return null;
    }
  }

  async getBatchDownload(batchId: string, user?: any): Promise<
    | { type: 'local'; path: string; filename: string }
    | { type: 'stream'; filename: string; contentType?: string; contentLength?: number; stream: NodeJS.ReadableStream }
    | { type: 'redirect'; url: string; filename: string }
  > {
    const file = await this.getBatchFile(batchId, user);

    if (!file.isUrl) {
      return { type: 'local', path: file.path, filename: file.filename };
    }

    const parsed = this.extractKeyFromPublicUrl(file.path);
    if (parsed?.key) {
      const object = await this.s3Service.getObjectStream(parsed.key);
      if (object?.body) {
        return {
          type: 'stream',
          filename: parsed.filename,
          contentType: object.contentType,
          contentLength: object.contentLength,
          stream: object.body
        };
      }
    }

    return {
      type: 'redirect',
      url: file.path.startsWith('http://') ? `https://${file.path.slice('http://'.length)}` : file.path,
      filename: file.filename
    };
  }

  async reactivateQr(data: { stateCode: string; oemCode: string; serialNumber: number }, userId: string, isGhost: boolean = false) {
    const { stateCode, oemCode, serialNumber } = data;
    
    // 1. Find the QR Code by Serial + State + OEM
    // The serial number is unique within the context of a Batch, 
    // but the global uniqueness comes from sequence logic.
    // However, here we just want to find a QR code that matches these 3 criteria.
    const qr = await this.prisma.qRCode.findFirst({
      where: { 
        serialNumber: serialNumber,
        batch: {
            stateCode: stateCode,
            oemCode: oemCode,
            isGhost: isGhost
        }
      },
      include: {
        batch: true,
        certificates: true
      }
    });

    if (!qr) {
      throw new NotFoundException(`QR Code with Serial '${serialNumber}' not found for State '${stateCode}' and OEM '${oemCode}' (Ghost: ${isGhost})`);
    }

    // 2. Perform Reactivation Transaction
    // - Delete Certificate if exists
    // - Reset QR Status to 0
    
    await this.prisma.$transaction(async (tx) => {
        await tx.certificate.deleteMany({
          where: { qrCodeId: qr.id, qrValue: qr.value }
        });
        
        await tx.qRCode.update({
            where: { id: qr.id },
            data: { 
                status: 0,
            }
        });
    });

    return { success: true, message: 'QR Code reactivated successfully' };
  }

  async deactivateGhostV1Duplicates(
    data: {
      stateCode: string;
      oemCode: string;
      productCode: string;
      startSerial: number;
      endSerial: number;
      keep?: 'LATEST' | 'OLDEST';
    },
    userId: string
  ) {
    const stateCode = String(data.stateCode || '').trim();
    const oemCode = String(data.oemCode || '').trim();
    const productCode = String(data.productCode || '').trim();
    const startSerial = Number(data.startSerial);
    const endSerial = Number(data.endSerial);
    const keep = (data.keep || 'LATEST').toString().toUpperCase() as 'LATEST' | 'OLDEST';

    if (!stateCode || !oemCode || !productCode) {
      throw new BadRequestException('Missing required fields: stateCode, oemCode, productCode');
    }
    if (!Number.isFinite(startSerial) || !Number.isFinite(endSerial) || startSerial <= 0 || endSerial <= 0) {
      throw new BadRequestException('startSerial and endSerial must be positive numbers');
    }
    if (endSerial < startSerial) {
      throw new BadRequestException('endSerial must be >= startSerial');
    }
    if (keep !== 'LATEST' && keep !== 'OLDEST') {
      throw new BadRequestException("keep must be 'LATEST' or 'OLDEST'");
    }

    const rangeSize = endSerial - startSerial + 1;
    if (rangeSize > 5000) {
      throw new BadRequestException('Range too large. Maximum range is 5000 serials per request.');
    }

    const ghostQrs = await this.prisma.qRCode.findMany({
      where: {
        batch: {
          stateCode,
          oemCode,
          productCode,
          isGhost: true
        },
        serialNumber: { gte: startSerial, lte: endSerial }
      },
      include: {
        batch: { select: { batchId: true, isGhost: true } },
        certificates: { select: { id: true }, take: 1 }
      },
      orderBy: [{ serialNumber: 'asc' }, { createdAt: 'desc' }]
    });

    const bySerial = new Map<number, typeof ghostQrs>();
    for (const qr of ghostQrs) {
      const list = bySerial.get(qr.serialNumber) || [];
      list.push(qr);
      bySerial.set(qr.serialNumber, list);
    }

    const toDeactivateIds: string[] = [];
    let groupsWithDuplicates = 0;
    let skippedUsedOrHasCert = 0;

    for (const [serial, list] of bySerial.entries()) {
      if (list.length <= 1) continue;
      groupsWithDuplicates++;

      const sorted = [...list].sort((a, b) => {
        const diff = a.createdAt.getTime() - b.createdAt.getTime();
        return diff === 0 ? a.id.localeCompare(b.id) : diff;
      });

      const keepQr = keep === 'OLDEST' ? sorted[0] : sorted[sorted.length - 1];
      for (const qr of sorted) {
        if (qr.id === keepQr.id) continue;
        if (qr.certificates && qr.certificates.length > 0) {
          skippedUsedOrHasCert++;
          continue;
        }
        toDeactivateIds.push(qr.id);
      }
    }

    if (toDeactivateIds.length > 0) {
      await this.prisma.qRCode.updateMany({
        where: { id: { in: toDeactivateIds } },
        data: { status: 2 }
      });
    }

    await this.auditService.logAction(
      userId,
      'DEACTIVATE_GHOST_V1_DUPLICATES',
      'QRCODE',
      null,
      `Deactivated ${toDeactivateIds.length} duplicate ghost(v1) QR codes for ${stateCode}-${oemCode}-${productCode} serials ${startSerial}-${endSerial}. Groups with duplicates: ${groupsWithDuplicates}. Skipped with certificates: ${skippedUsedOrHasCert}. Keep=${keep}.`
    );

    return {
      success: true,
      data: {
        scannedSerials: rangeSize,
        foundGhostRecords: ghostQrs.length,
        groupsWithDuplicates,
        deactivatedCount: toDeactivateIds.length,
        skippedUsedOrHasCert,
        keep
      }
    };
  }

  async restoreGhostQr(
    data: { qrValue?: string; qrCodeId?: string },
    userId: string
  ) {
    const qrValue = data.qrValue != null ? String(data.qrValue).trim() : '';
    const qrCodeId = data.qrCodeId != null ? String(data.qrCodeId).trim() : '';
    if (!qrValue && !qrCodeId) {
      throw new BadRequestException('Provide qrValue or qrCodeId');
    }

    const qr = await this.prisma.qRCode.findUnique({
      where: qrCodeId ? { id: qrCodeId } : { value: qrValue },
      include: {
        batch: true,
        certificates: { select: { id: true }, take: 1 }
      }
    });
    if (!qr) throw new NotFoundException('QR Code not found');
    if (!qr.batch?.isGhost) throw new BadRequestException('Only ghost QR codes can be restored with this endpoint');
    if (qr.certificates && qr.certificates.length > 0) {
      throw new BadRequestException('Cannot restore: QR has a certificate linked');
    }
    if (qr.status !== 2) {
      throw new BadRequestException('QR Code is not deactivated');
    }

    await this.prisma.qRCode.update({ where: { id: qr.id }, data: { status: 0 } });

    await this.auditService.logAction(
      userId,
      'RESTORE_GHOST_QR',
      'QRCODE',
      qr.id,
      `Restored ghost QR code (value=${qr.value}, serial=${qr.serialNumber}, batch=${qr.batch.batchId}) from status=2 to status=0`
    );

    return { success: true, message: 'Ghost QR restored successfully' };
  }

  async getGhostV1Stats(params: {
    stateCode?: string;
    oemCode?: string;
    productCode?: string;
  }) {
    const stateCode = params.stateCode ? String(params.stateCode).trim() : '';
    const oemCode = params.oemCode ? String(params.oemCode).trim() : '';
    const productCode = params.productCode ? String(params.productCode).trim() : '';

    const batchWhere: any = {
      isGhost: true,
      qrCodes: { some: {} }
    };
    if (stateCode) batchWhere.stateCode = stateCode;
    if (oemCode) batchWhere.oemCode = oemCode;
    if (productCode) batchWhere.productCode = productCode;

    const batches = await this.prisma.batch.findMany({
      where: batchWhere,
      select: {
        id: true,
        batchId: true,
        stateCode: true,
        oemCode: true,
        productCode: true,
        startSerial: true,
        endSerial: true,
        quantity: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (batches.length === 0) {
      return {
        success: true,
        data: {
          totals: {
            ghostV1Batches: 0,
            ghostV1QrTotal: 0,
            ghostV1UnusedActive: 0,
            ghostV1Used: 0,
            ghostV1Deactivated: 0
          },
          batches: []
        }
      };
    }

    const batchIds = batches.map((b) => b.id);
    const grouped = await this.prisma.qRCode.groupBy({
      by: ['batchId', 'status'],
      where: { batchId: { in: batchIds } },
      _count: { _all: true }
    });

    const countsByBatch = new Map<
      string,
      { total: number; unusedActive: number; used: number; deactivated: number }
    >();
    for (const g of grouped) {
      const existing = countsByBatch.get(g.batchId) || {
        total: 0,
        unusedActive: 0,
        used: 0,
        deactivated: 0
      };
      const c = g._count._all;
      existing.total += c;
      if (g.status === 0) existing.unusedActive += c;
      else if (g.status === 1) existing.used += c;
      else if (g.status === 2) existing.deactivated += c;
      countsByBatch.set(g.batchId, existing);
    }

    const batchSummaries = batches.map((b) => {
      const c = countsByBatch.get(b.id) || {
        total: 0,
        unusedActive: 0,
        used: 0,
        deactivated: 0
      };
      return {
        batchId: b.batchId,
        stateCode: b.stateCode,
        oemCode: b.oemCode,
        productCode: b.productCode,
        startSerial: b.startSerial,
        endSerial: b.endSerial,
        quantity: b.quantity,
        status: b.status,
        createdAt: b.createdAt,
        counts: c
      };
    });

    const totals = batchSummaries.reduce(
      (acc, b) => {
        acc.ghostV1Batches += 1;
        acc.ghostV1QrTotal += b.counts.total;
        acc.ghostV1UnusedActive += b.counts.unusedActive;
        acc.ghostV1Used += b.counts.used;
        acc.ghostV1Deactivated += b.counts.deactivated;
        return acc;
      },
      {
        ghostV1Batches: 0,
        ghostV1QrTotal: 0,
        ghostV1UnusedActive: 0,
        ghostV1Used: 0,
        ghostV1Deactivated: 0
      }
    );

    return {
      success: true,
      data: {
        totals,
        batches: batchSummaries
      }
    };
  }

  async backupGhostV1Batch(params: { batchId: string }) {
    const batchId = String(params.batchId || '').trim();
    if (!batchId) throw new BadRequestException('batchId is required');

    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        qrCodes: {
          orderBy: [{ serialNumber: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!batch.isGhost) throw new BadRequestException('Only ghost batches are supported');
    if (!batch.qrCodes || batch.qrCodes.length === 0) {
      throw new BadRequestException('This ghost batch has no QR codes (likely V2 regeneration); nothing to backup');
    }

    return {
      success: true,
      data: {
        version: 'GHOST_V1_BATCH_BACKUP_V1',
        exportedAt: new Date().toISOString(),
        batch: {
          batchId: batch.batchId,
          stateCode: batch.stateCode,
          oemCode: batch.oemCode,
          productCode: batch.productCode,
          quantity: batch.quantity,
          startSerial: batch.startSerial,
          endSerial: batch.endSerial,
          status: batch.status,
          filePath: batch.filePath,
          isGhost: batch.isGhost,
          createdAt: batch.createdAt.toISOString()
        },
        qrCodes: batch.qrCodes.map((q) => ({
          value: q.value,
          fullUrl: q.fullUrl,
          serialNumber: q.serialNumber,
          status: q.status,
          count: q.count,
          createdAt: q.createdAt.toISOString()
        }))
      }
    };
  }

  async deleteGhostV1Batch(params: { batchId: string }, userId: string) {
    const batchId = String(params.batchId || '').trim();
    if (!batchId) throw new BadRequestException('batchId is required');

    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      select: { id: true, batchId: true, isGhost: true }
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!batch.isGhost) throw new BadRequestException('Only ghost batches can be deleted with this endpoint');

    const qrCount = await this.prisma.qRCode.count({ where: { batchId: batch.id } });
    if (qrCount === 0) {
      throw new BadRequestException('This ghost batch has no QR codes (likely V2 regeneration); refusing to delete');
    }

    const certCount = await this.prisma.certificate.count({
      where: { qrCode: { batchId: batch.id } }
    });
    if (certCount > 0) {
      throw new BadRequestException('Cannot delete: one or more QRs in this batch already have certificates');
    }

    await this.prisma.batch.delete({ where: { batchId } });

    await this.auditService.logAction(
      userId,
      'DELETE_GHOST_V1_BATCH',
      'BATCH',
      batchId,
      `Deleted ghost(v1) batch ${batchId} (QRs deleted: ${qrCount})`
    );

    return { success: true, message: 'Ghost v1 batch deleted successfully', data: { batchId, deletedQrCount: qrCount } };
  }

  async restoreGhostV1Batch(
    params: {
      backup: any;
      onConflict?: 'FAIL' | 'SKIP';
      forceNewBatchId?: boolean;
    },
    userId: string
  ) {
    const backup = params.backup;
    const onConflict = (params.onConflict || 'FAIL').toString().toUpperCase() as 'FAIL' | 'SKIP';
    const forceNewBatchId = Boolean(params.forceNewBatchId);
    if (!backup || typeof backup !== 'object') throw new BadRequestException('backup is required');
    if (backup.version !== 'GHOST_V1_BATCH_BACKUP_V1') throw new BadRequestException('Unsupported backup version');
    if (onConflict !== 'FAIL' && onConflict !== 'SKIP') throw new BadRequestException("onConflict must be 'FAIL' or 'SKIP'");

    const b = backup.batch || {};
    const qrCodes: any[] = Array.isArray(backup.qrCodes) ? backup.qrCodes : [];
    const stateCode = String(b.stateCode || '').trim();
    const oemCode = String(b.oemCode || '').trim();
    const productCode = String(b.productCode || '').trim();
    if (!stateCode || !oemCode || !productCode) {
      throw new BadRequestException('Invalid backup: missing stateCode/oemCode/productCode');
    }
    if (qrCodes.length === 0) throw new BadRequestException('Invalid backup: no qrCodes found');

    let batchId = String(b.batchId || '').trim();
    if (!batchId) throw new BadRequestException('Invalid backup: missing batchId');

    const existingBatch = await this.prisma.batch.findUnique({ where: { batchId } });
    if (existingBatch) {
      if (!forceNewBatchId) {
        throw new BadRequestException('BatchId already exists. Use forceNewBatchId=true to restore under a new batchId.');
      }
      let newBatchId = this.generateBatchId();
      while (await this.prisma.batch.findUnique({ where: { batchId: newBatchId } })) {
        newBatchId = this.generateBatchId();
      }
      batchId = newBatchId;
    }

    const values = qrCodes.map((q) => String(q.value || '').trim()).filter((v) => v.length > 0);
    if (values.length !== qrCodes.length) throw new BadRequestException('Invalid backup: one or more QR values are missing');

    const conflicts = await this.prisma.qRCode.findMany({
      where: { value: { in: values } },
      select: { value: true, batch: { select: { isGhost: true, batchId: true } } },
      take: 50
    });
    if (conflicts.length > 0 && onConflict === 'FAIL') {
      throw new BadRequestException(
        `Restore blocked: ${conflicts.length} QR values already exist in DB (showing up to 50). Example: ${conflicts[0].value}`
      );
    }

    const baseUrl = (process.env.BASE_URL || 'https://smartvahan.com').replace(/\/$/, '');
    const createPayload = qrCodes.map((q) => {
      const value = String(q.value || '').trim();
      const serialNumber = Number(q.serialNumber);
      const fullUrl = String(q.fullUrl || '').trim() || `${baseUrl}/${stateCode}/${oemCode}/${productCode}/qr=${value}`;
      const status = Number(q.status);
      const count = Number.isFinite(Number(q.count)) ? Number(q.count) : 1;
      if (!Number.isFinite(serialNumber) || serialNumber <= 0) {
        throw new BadRequestException('Invalid backup: serialNumber must be a positive number');
      }
      return {
        value,
        fullUrl,
        serialNumber,
        status: Number.isFinite(status) ? status : 0,
        count
      };
    });

    const restored = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.batch.create({
        data: {
          batchId,
          userId,
          stateCode,
          oemCode,
          productCode,
          quantity: Number(b.quantity) || createPayload.length,
          startSerial: b.startSerial ? String(b.startSerial) : null,
          endSerial: b.endSerial ? String(b.endSerial) : null,
          status: 'RESTORED',
          filePath: b.filePath ? String(b.filePath) : '',
          isGhost: true
        },
        select: { id: true, batchId: true }
      });

      const result = await tx.qRCode.createMany({
        data: createPayload.map((q) => ({ ...q, batchId: createdBatch.id })),
        skipDuplicates: onConflict === 'SKIP'
      });

      return { createdBatch, createdCount: result.count };
    });

    await this.auditService.logAction(
      userId,
      'RESTORE_GHOST_V1_BATCH',
      'BATCH',
      restored.createdBatch.batchId,
      `Restored ghost(v1) batch ${restored.createdBatch.batchId} with ${restored.createdCount}/${createPayload.length} QR codes (onConflict=${onConflict})`
    );

    return {
      success: true,
      data: {
        batchId: restored.createdBatch.batchId,
        requestedQrCount: createPayload.length,
        restoredQrCount: restored.createdCount,
        onConflict
      }
    };
  }

  async deactivateGhostV1BatchUnused(params: { batchId: string }, userId: string) {
    const batchId = String(params.batchId || '').trim();
    if (!batchId) throw new BadRequestException('batchId is required');

    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      select: { id: true, batchId: true, isGhost: true }
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!batch.isGhost) throw new BadRequestException('Only ghost batches are supported');

    const qrCount = await this.prisma.qRCode.count({ where: { batchId: batch.id } });
    if (qrCount === 0) {
      throw new BadRequestException('This ghost batch has no QR codes (likely V2 regeneration)');
    }

    const updated = await this.prisma.qRCode.updateMany({
      where: { batchId: batch.id, status: 0 },
      data: { status: 2 }
    });

    await this.auditService.logAction(
      userId,
      'DEACTIVATE_GHOST_V1_BATCH_UNUSED',
      'BATCH',
      batchId,
      `Deactivated ${updated.count} UNUSED QR codes in ghost(v1) batch ${batchId}`
    );

    return { success: true, data: { batchId, deactivatedCount: updated.count } };
  }

  async reactivateGhostV1Batch(params: { batchId: string }, userId: string) {
    const batchId = String(params.batchId || '').trim();
    if (!batchId) throw new BadRequestException('batchId is required');

    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      select: { id: true, batchId: true, isGhost: true }
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!batch.isGhost) throw new BadRequestException('Only ghost batches are supported');

    const qrCount = await this.prisma.qRCode.count({ where: { batchId: batch.id } });
    if (qrCount === 0) {
      throw new BadRequestException('This ghost batch has no QR codes (likely V2 regeneration)');
    }

    const updated = await this.prisma.qRCode.updateMany({
      where: { batchId: batch.id, status: 2 },
      data: { status: 0 }
    });

    await this.auditService.logAction(
      userId,
      'REACTIVATE_GHOST_V1_BATCH',
      'BATCH',
      batchId,
      `Reactivated ${updated.count} deactivated QR codes in ghost(v1) batch ${batchId}`
    );

    return { success: true, data: { batchId, reactivatedCount: updated.count } };
  }

  async listGhostV2Runs(params: {
    stateCode?: string;
    oemCode?: string;
    productCode?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (params.stateCode) where.stateCode = String(params.stateCode).trim();
    if (params.oemCode) where.oemCode = String(params.oemCode).trim();
    if (params.productCode) where.productCode = String(params.productCode).trim();

    const createdAt: any = {};
    if (params.from) {
      const d = new Date(params.from);
      if (!isNaN(d.getTime())) createdAt.gte = d;
    }
    if (params.to) {
      const d = new Date(params.to);
      if (!isNaN(d.getTime())) {
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));
    const offset = Math.max(0, Number(params.offset || 0));

    const runs = await this.prisma.qRRegenerationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    const ids = runs.map((r) => r.id);
    const counts = ids.length
      ? await this.prisma.qRRegeneration.groupBy({
          by: ['runId'],
          where: { runId: { in: ids } },
          _count: { _all: true }
        })
      : [];
    const countMap = new Map<string, number>();
    for (const c of counts) countMap.set(c.runId, c._count._all);

    return {
      success: true,
      data: runs.map((r) => ({
        id: r.id,
        stateCode: r.stateCode,
        oemCode: r.oemCode,
        productCode: r.productCode,
        startSerial: r.startSerial,
        requestedQuantity: r.requestedQuantity,
        eligibleCount: r.eligibleCount,
        regeneratedCount: r.regeneratedCount,
        filePath: r.filePath || null,
        createdAt: r.createdAt,
        createdBy: r.createdBy || null,
        itemCount: countMap.get(r.id) || 0
      }))
    };
  }

  async getGhostV2Run(runId: string) {
    const id = String(runId || '').trim();
    if (!id) throw new BadRequestException('runId is required');

    const run = await this.prisma.qRRegenerationRun.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { serialNumber: 'asc' }
        }
      }
    });
    if (!run) throw new NotFoundException('Regeneration run not found');

    return {
      success: true,
      data: {
        id: run.id,
        stateCode: run.stateCode,
        oemCode: run.oemCode,
        productCode: run.productCode,
        startSerial: run.startSerial,
        requestedQuantity: run.requestedQuantity,
        eligibleCount: run.eligibleCount,
        regeneratedCount: run.regeneratedCount,
        filePath: run.filePath || null,
        createdAt: run.createdAt,
        createdBy: run.createdBy || null,
        items: run.items.map((i) => ({
          serialNumber: i.serialNumber,
          oldQrValue: i.oldQrValue,
          newQrValue: i.newQrValue,
          regeneratedAt: i.regeneratedAt,
          regeneratedBy: i.regeneratedBy || null
        }))
      }
    };
  }

  private async getGhostV2NewValues(runId: string): Promise<string[]> {
    const rows = await this.prisma.qRRegeneration.findMany({
      where: { runId },
      select: { newQrValue: true }
    });
    return rows.map((r) => r.newQrValue);
  }

  async getGhostV2RunStatusCounts(runId: string) {
    const id = String(runId || '').trim();
    if (!id) throw new BadRequestException('runId is required');

    const run = await this.prisma.qRRegenerationRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Regeneration run not found');

    const values = await this.getGhostV2NewValues(id);
    if (values.length === 0) {
      return {
        success: true,
        data: {
          runId: id,
          total: 0,
          unusedActive: 0,
          used: 0,
          deactivated: 0,
          missing: 0
        }
      };
    }

    const grouped = await this.prisma.qRCode.groupBy({
      by: ['status'],
      where: { value: { in: values } },
      _count: { _all: true }
    });

    let unusedActive = 0;
    let used = 0;
    let deactivated = 0;
    let found = 0;
    for (const g of grouped) {
      const c = g._count._all;
      found += c;
      if (g.status === 0) unusedActive += c;
      else if (g.status === 1) used += c;
      else if (g.status === 2) deactivated += c;
    }

    return {
      success: true,
      data: {
        runId: id,
        total: values.length,
        unusedActive,
        used,
        deactivated,
        missing: Math.max(0, values.length - found)
      }
    };
  }

  async deactivateGhostV2RunUnused(runId: string, userId: string) {
    const id = String(runId || '').trim();
    if (!id) throw new BadRequestException('runId is required');
    const run = await this.prisma.qRRegenerationRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Regeneration run not found');

    const values = await this.getGhostV2NewValues(id);
    if (values.length === 0) throw new BadRequestException('No items found for this run');

    const updated = await this.prisma.qRCode.updateMany({
      where: { value: { in: values }, status: 0 },
      data: { status: 2 }
    });

    await this.auditService.logAction(
      userId,
      'DEACTIVATE_GHOST_V2_RUN_UNUSED',
      'QR_REGENERATION_RUN',
      id,
      `Deactivated ${updated.count} UNUSED QRs for V2 run ${id} (${run.stateCode}-${run.oemCode}-${run.productCode})`
    );

    return { success: true, data: { runId: id, deactivatedCount: updated.count } };
  }

  async reactivateGhostV2Run(runId: string, userId: string) {
    const id = String(runId || '').trim();
    if (!id) throw new BadRequestException('runId is required');
    const run = await this.prisma.qRRegenerationRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Regeneration run not found');

    const values = await this.getGhostV2NewValues(id);
    if (values.length === 0) throw new BadRequestException('No items found for this run');

    const updated = await this.prisma.qRCode.updateMany({
      where: { value: { in: values }, status: 2 },
      data: { status: 0 }
    });

    await this.auditService.logAction(
      userId,
      'REACTIVATE_GHOST_V2_RUN',
      'QR_REGENERATION_RUN',
      id,
      `Reactivated ${updated.count} QRs for V2 run ${id} (${run.stateCode}-${run.oemCode}-${run.productCode})`
    );

    return { success: true, data: { runId: id, reactivatedCount: updated.count } };
  }

  async getGhostV2RunDownload(runId: string): Promise<
    | { type: 'local'; path: string; filename: string }
    | { type: 'stream'; filename: string; contentType?: string; contentLength?: number; stream: NodeJS.ReadableStream }
    | { type: 'redirect'; url: string; filename: string }
  > {
    const id = String(runId || '').trim();
    if (!id) throw new BadRequestException('runId is required');

    const run = await this.prisma.qRRegenerationRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Regeneration run not found');
    if (!run.filePath) throw new NotFoundException('Run file not available');

    const filename = path.basename(run.filePath);
    if (run.filePath.startsWith('http://') || run.filePath.startsWith('https://')) {
      const parsed = this.extractKeyFromPublicUrl(run.filePath);
      if (parsed?.key) {
        const object = await this.s3Service.getObjectStream(parsed.key);
        if (object?.body) {
          return {
            type: 'stream',
            filename: parsed.filename,
            contentType: object.contentType,
            contentLength: object.contentLength,
            stream: object.body
          };
        }
      }

      const url = run.filePath.startsWith('http://') ? `https://${run.filePath.slice('http://'.length)}` : run.filePath;
      return { type: 'redirect', url, filename };
    }
    if (!fs.existsSync(run.filePath)) {
      throw new NotFoundException('File not found on server');
    }
    return { type: 'local', path: run.filePath, filename };
  }

  private generateBatchId() {
    // 5 digit alphanumeric
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateRandomString(length: number) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private formatDateDDMMYYYY(date: Date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}${month}${year}`;
  }

  private async generateUniqueQrValueWithClient(client: any, productCode: string, reserved: Set<string>) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const random = crypto.randomBytes(10).toString('hex').toUpperCase();
      const candidate = `${productCode}${random}`;
      if (reserved.has(candidate)) continue;
      const exists = await client.qRCode.findUnique({ where: { value: candidate } });
      if (!exists) {
        reserved.add(candidate);
        return candidate;
      }
    }
    throw new Error('Failed to generate unique QR value');
  }

  private async generateGhostReprintPdfV2(
    pages: Array<{
      stateCode: string;
      oemCode: string;
      productCode: string;
      serialNumber: number;
      qrValue: string;
      originalBatchId: string;
      originalBatchCreatedAt: Date;
      originalBatchStartSerial: string | null;
      originalBatchQuantity: number;
    }>,
    stateCode: string,
    oemCode: string,
    productCode: string,
    baseUrl: string,
    runId?: string
  ): Promise<{ filePath: string; processedCount: number }> {
    const width = 708.66;
    const height = 1077.16;
    const margin = 56.7;

    const doc = new PDFDocument({
      size: [width, height],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false
    });

    const dateObj = new Date();
    const dateDMY = this.formatDateDDMMYYYY(dateObj);
    const runTag = runId ? runId.replace(/-/g, '').slice(0, 10) : Date.now().toString();
    const fileName = `Reprint-${stateCode}-${oemCode}-${productCode}-${pages.length}-${dateDMY}-${runTag}.pdf`;
    const filePath = path.join(process.cwd(), 'uploads', 'QR', stateCode, oemCode, fileName);

    const baseDir = path.dirname(filePath);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const sorted = [...pages].sort((a, b) => a.serialNumber - b.serialNumber);

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      doc.addPage();

      const effectiveUrl = `${baseUrl}/${p.stateCode}/${p.oemCode}/${p.productCode}/qr=${p.qrValue}`;
      const qrDataUrl = await QRCode.toDataURL(effectiveUrl, { errorCorrectionLevel: 'H', margin: 1 });
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");

      const usableWidth = width - (margin * 2);
      const headerY = margin + 20;

      doc.font('Helvetica-Bold')
        .fontSize(75)
        .text(`${p.stateCode}-${p.oemCode}-${p.productCode}`, 0, headerY, { align: 'center', width });

      const qrY = headerY + 100;
      const qrSize = usableWidth;
      doc.image(Buffer.from(base64Data, 'base64'), margin, qrY, { width: qrSize, height: qrSize });

      const serialY = qrY + qrSize + 30;
      doc.font('Helvetica-Bold').fontSize(90).text(`${p.serialNumber}`, 0, serialY, { align: 'center', width });

      const footer2Y = height - margin - 40;
      const footer1Y = footer2Y - 70;
      const dateYMD = p.originalBatchCreatedAt.toISOString().split('T')[0].replace(/-/g, '');

      const start = p.originalBatchStartSerial ? Number(p.originalBatchStartSerial) : NaN;
      const pageNo = Number.isFinite(start) ? (p.serialNumber - start + 1) : 1;
      const total = p.originalBatchQuantity || 1;
      const footer1 = `${dateYMD}-${p.originalBatchId}-(${pageNo}/${total})`;
      doc.font('Helvetica').fontSize(45).text(footer1, 0, footer1Y, { align: 'center', width });

      doc.font('Helvetica-Bold')
        .fontSize(30)
        .text("SADAK SURAKSHA JEEVAN RAKSHA", 0, footer2Y, { align: 'center', width });
    }

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    let finalFilePath = filePath;
    const s3Key = runId
      ? `qr-batches/reprints/${stateCode}/${oemCode}/${runId}/${fileName}`
      : `qr-batches/reprints/${stateCode}/${oemCode}/${fileName}`;
    const s3Url = await this.s3Service.uploadFile(filePath, s3Key);
    if (s3Url) {
      finalFilePath = s3Url;
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        this.logger.error("Failed to delete local Reprint PDF after S3 upload", e);
      }
    }

    return { filePath: finalFilePath, processedCount: sorted.length };
  }
}
