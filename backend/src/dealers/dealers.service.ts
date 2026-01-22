import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Dealer, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class DealersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService
  ) {}

  private async uploadFile(base64Data: string, prefix: string): Promise<string> {
      if (!base64Data || !base64Data.startsWith('data:')) return base64Data;

      // Check System Settings for S3 Config
      const settings = await this.prisma.systemSettings.findUnique({ where: { id: 'SYSTEM_SETTINGS' } });

      if (settings?.awsAccessKey && settings?.awsSecretKey && settings?.awsBucket && settings?.awsRegion) {
          return this.uploadToS3(base64Data, prefix, settings);
      }

      // Fallback to Local Storage
      return this.saveToLocal(base64Data, prefix);
  }

  private saveToLocal(base64Data: string, prefix: string): string {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) return base64Data;
      
      const type = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      let ext = 'bin';
      if (type.includes('jpeg') || type.includes('jpg')) ext = 'jpg';
      else if (type.includes('png')) ext = 'png';
      else if (type.includes('pdf')) ext = 'pdf';
      
      const fileName = `${prefix}_${Date.now()}.${ext}`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'dealers');
      if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);
      
      return `uploads/dealers/${fileName}`; 
  }

  private async uploadToS3(base64Data: string, prefix: string, settings: any): Promise<string> {
      try {
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return base64Data;

        const type = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        let ext = 'bin';
        if (type.includes('jpeg') || type.includes('jpg')) ext = 'jpg';
        else if (type.includes('png')) ext = 'png';
        else if (type.includes('pdf')) ext = 'pdf';

        const fileName = `dealers/${prefix}_${Date.now()}.${ext}`;

        const s3 = new S3Client({
            region: settings.awsRegion,
            credentials: {
                accessKeyId: settings.awsAccessKey,
                secretAccessKey: settings.awsSecretKey,
            },
        });

        await s3.send(new PutObjectCommand({
            Bucket: settings.awsBucket,
            Key: fileName,
            Body: buffer,
            ContentType: type,
            // ACL: 'public-read' // Optional: depends on bucket settings
        }));

        // Return S3 URL
        return `https://${settings.awsBucket}.s3.${settings.awsRegion}.amazonaws.com/${fileName}`;
      } catch (error) {
          console.error("S3 Upload Error, falling back to local:", error);
          return this.saveToLocal(base64Data, prefix);
      }
  }

  async create(data: any, createdByUserId?: string): Promise<Dealer> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    // Handle File Uploads
    if (data.tradeCertificateUrl) {
        data.tradeCertificateUrl = await this.uploadFile(data.tradeCertificateUrl, 'trade');
    }
    if (data.gstCertificateUrl) {
        data.gstCertificateUrl = await this.uploadFile(data.gstCertificateUrl, 'gst');
    }
    if (data.aadharCardUrl) {
        data.aadharCardUrl = await this.uploadFile(data.aadharCardUrl, 'aadhar');
    }
    
    // Handle OEMs
    const oemConnect = [];
    if (data.oemCodes && Array.isArray(data.oemCodes)) {
        data.oemCodes.forEach((code: string) => oemConnect.push({ code }));
    } else if (data.oemCode) {
        oemConnect.push({ code: data.oemCode });
    }
    if (data.oemIds && Array.isArray(data.oemIds)) {
        data.oemIds.forEach((id: string) => oemConnect.push({ id }));
    }

    // Handle RTO
    const rtoData = (data.rtoCode === 'ALL' || !data.rtoCode)
        ? { allRTOs: true, rtoCode: null }
        : { allRTOs: false, rtoCode: data.rtoCode };

    // Remove fields we handled specially or that need mapping
    const { oemCode, oemCodes, oemIds, rtoCode, address, pincode, ...rest } = data;

    console.log('Creating Dealer with data:', {
        ...rest,
        ...rtoData,
        locationAddress: address || data.locationAddress,
        zip: pincode || data.zip,
        oemsConnect: oemConnect
    });

    try {
        const dealer = await this.prisma.dealer.create({
            data: {
                ...rest,
                ...rtoData,
                locationAddress: address || data.locationAddress,
                zip: pincode || data.zip,
                password: hashedPassword,
                radius: data.radius ? parseFloat(data.radius) : 10,
                latitude: data.latitude ? parseFloat(data.latitude) : null,
                longitude: data.longitude ? parseFloat(data.longitude) : null,
                oems: {
                    connect: oemConnect
                }
            },
        });

        // Audit Log
        if (createdByUserId) {
            await this.auditService.logAction(
                createdByUserId,
                'CREATE_DEALER',
                'DEALER',
                dealer.id,
                `Created dealer ${dealer.name} (${dealer.phone})`
            );
        }

        return dealer;
    } catch (e) {
        console.error('Error creating dealer:', e);
        throw e;
    }
  }

  async findAll(): Promise<Dealer[]> {
    return this.prisma.dealer.findMany({
        include: {
            state: true,
            rto: true,
            oems: true
        },
        orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string): Promise<Dealer | null> {
    return this.prisma.dealer.findUnique({
        where: { id },
        include: {
            state: true,
            rto: true,
            oems: true
        }
    });
  }

  async update(id: string, data: any): Promise<Dealer> {
    if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
    }
    if (data.radius) data.radius = parseFloat(data.radius);
    if (data.latitude) data.latitude = parseFloat(data.latitude);
    if (data.longitude) data.longitude = parseFloat(data.longitude);

    // Handle File Uploads
    if (data.tradeCertificateUrl) {
        data.tradeCertificateUrl = await this.uploadFile(data.tradeCertificateUrl, 'trade');
    }
    if (data.gstCertificateUrl) {
        data.gstCertificateUrl = await this.uploadFile(data.gstCertificateUrl, 'gst');
    }
    if (data.aadharCardUrl) {
        data.aadharCardUrl = await this.uploadFile(data.aadharCardUrl, 'aadhar');
    }

    const updateData: any = { ...data };
    
    // Handle OEMs update if provided
    if (data.oemCodes) {
        updateData.oems = {
            set: data.oemCodes.map((code: string) => ({ code }))
        };
        delete updateData.oemCodes;
    } else if (data.oemCode) { // fallback
         updateData.oems = {
            set: [{ code: data.oemCode }]
        };
        delete updateData.oemCode;
    }

    // Handle RTO update if provided
    if (data.rtoCode !== undefined) {
        if (data.rtoCode === 'ALL' || !data.rtoCode) {
            updateData.allRTOs = true;
            updateData.rtoCode = null;
        } else {
            updateData.allRTOs = false;
            updateData.rtoCode = data.rtoCode;
        }
    }

    return this.prisma.dealer.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string): Promise<Dealer> {
    return this.prisma.dealer.delete({ where: { id } });
  }
}
