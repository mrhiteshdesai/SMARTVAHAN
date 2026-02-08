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
        certificate: true
      }
    });

    if (!qr) {
      throw new NotFoundException(`QR Code with Serial '${serialNumber}' not found for State '${stateCode}' and OEM '${oemCode}' (Ghost: ${isGhost})`);
    }

    // 2. Perform Reactivation Transaction
    // - Delete Certificate if exists
    // - Reset QR Status to 0
    
    await this.prisma.$transaction(async (tx) => {
        if (qr.certificate) {
            await tx.certificate.delete({
                where: { id: qr.certificate.id }
            });
        }
        
        await tx.qRCode.update({
            where: { id: qr.id },
            data: { 
                status: 0,
            }
        });
    });

    return { success: true, message: 'QR Code reactivated successfully' };
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
}
