import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  constructor(private prisma: PrismaService) {}

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
            }
        });

        // Trigger Async Processing (Fire and forget, but catch errors inside)
        this.processBatch(batch.id, data, batchId, baseUrl).catch(err => {
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

  private async processBatch(dbId: string, data: any, batchId: string, baseUrl: string) {
      const { stateCode, oemCode, productCode, quantity } = data;
      
      // Update Status to PROCESSING
      await this.prisma.batch.update({
          where: { id: dbId },
          data: { status: 'PROCESSING' }
      });

      // Get Iteration Start
      // Sequence is per State > OEM
      // We increment by quantity, so the range is [newVal - quantity, newVal - 1]
      // Ensure initial value starts at 1000 if not exists
      
      const sequenceId = `QR_SEQ_${stateCode}_${oemCode}`;
      
      // Use upsert for atomic operation (BUG-QR-004)
      const sequence = await this.prisma.sequence.upsert({
          where: { id: sequenceId },
          create: { id: sequenceId, value: 1000 + quantity },
          update: { value: { increment: quantity } }
      });
      
      const startIteration = sequence.value - quantity; 

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
      
      const pdfName = `${stateCode}-${oemCode}-${productCode}-${dateDMY}-${batchId}.pdf`;
      
      // Directory: uploads/QR/{STATE}/{BRAND}
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
        const serial = startIteration + i;
        
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
        // Font: 60pt Bold (Reduced from 80pt)
        const headerY = margin + 20;
        doc.font('Helvetica-Bold').fontSize(60)
           .text(`${stateCode}-${oemCode}-${productCode}`, 0, headerY, { 
               align: 'center', 
               width: width // Center across full page width
           });
        
        // 2. QR Code Image
        // Make it as large as possible while keeping margins
        // Y Position: Below Header + Spacing
        const qrY = headerY + 80; // 60pt text + 20pt gap
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
        const footer1Y = footer2Y - 50;
        
        const footer1 = `${dateYMD}-${batchId}-(${i + 1}/${quantity})`;
        doc.font('Helvetica').fontSize(30)
           .text(footer1, 0, footer1Y, { 
               align: 'center', 
               width: width 
           });

        // 5. Footer Line 2: SADAK SURAKSHA JEEVAN RAKSHA
        // Position: Bottom Margin
        // Font: 25pt Bold (Reduced from 35pt)
        doc.font('Helvetica-Bold').fontSize(25)
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

      // Update Batch Record with Completion Details
      await this.prisma.batch.update({
          where: { id: dbId },
          data: {
              status: 'COMPLETED',
              startSerial: startSerialStr,
              endSerial: endSerialStr,
              filePath: filePath,
              qrCodes: {
                  create: qrRecords
              }
          }
      });
  }
  
  async getBatches() {
      return this.prisma.batch.findMany({
          include: { state: true, oem: true, product: true },
          orderBy: { createdAt: 'desc' }
      });
  }

  async getBatchFile(batchId: string) {
      const batch = await this.prisma.batch.findUnique({ where: { batchId } });
      if (!batch) throw new NotFoundException('Batch not found');
      
      if (batch.status !== 'COMPLETED') {
          throw new BadRequestException('Batch is not ready for download');
      }

      if (!batch.filePath || !fs.existsSync(batch.filePath)) {
          throw new NotFoundException('File not found on server');
      }
      
      return {
          path: batch.filePath,
          filename: path.basename(batch.filePath)
      };
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
