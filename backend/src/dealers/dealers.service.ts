import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Dealer, DealerRegistrationStatus } from '@prisma/client';
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

    const rtoData =
        data?.rtoCode !== undefined
            ? (data.rtoCode === 'ALL' || !data.rtoCode)
                ? { allRTOs: true, rtoCode: null }
                : { allRTOs: false, rtoCode: data.rtoCode }
            : {};

    const passingRtoCodes = Array.isArray(data.passingRtoCodes)
        ? data.passingRtoCodes.map((c: any) => String(c)).filter((c: string) => c.trim().length > 0)
        : [];
    const passingRtosAll = data.passingRtosAll === false ? false : true;

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
                passingRtosAll,
                passingRtoCodes: passingRtosAll ? [] : passingRtoCodes,
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

    if (data.passingRtosAll !== undefined || data.passingRtoCodes !== undefined) {
        const passingRtoCodes = Array.isArray(data.passingRtoCodes)
            ? data.passingRtoCodes.map((c: any) => String(c)).filter((c: string) => c.trim().length > 0)
            : [];
        const passingRtosAll = data.passingRtosAll === false ? false : true;

        updateData.passingRtosAll = passingRtosAll;
        updateData.passingRtoCodes = passingRtosAll ? [] : passingRtoCodes;
    }

    return this.prisma.dealer.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string): Promise<Dealer> {
    return this.prisma.dealer.delete({ where: { id } });
  }

  async submitRegistrationRequest(data: any) {
    const firstName = String(data?.firstName || '').trim();
    const lastName = String(data?.lastName || '').trim();
    const legacyName = String(data?.name || '').trim();
    const contactPersonName = [firstName, lastName].filter(Boolean).join(' ').trim() || legacyName;

    const email = String(data?.email || '').trim();
    const dealerName = String(data?.dealerName || '').trim();
    const phone = String(data?.phone || '').trim();

    if (!contactPersonName || !phone) {
      throw new BadRequestException('Contact person name and phone are required');
    }
    if (!dealerName) {
      throw new BadRequestException('Firm/Organization name is required');
    }
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const oemCodes = Array.isArray(data?.oemCodes)
      ? data.oemCodes.map((c: any) => String(c)).map((s: string) => s.trim()).filter(Boolean)
      : [];
    if (oemCodes.length === 0) {
      throw new BadRequestException('At least one OEM is required');
    }

    const passingRtoCodes = Array.isArray(data?.passingRtoCodes)
      ? data.passingRtoCodes.map((c: any) => String(c)).map((s: string) => s.trim()).filter(Boolean)
      : [];
    if (passingRtoCodes.length === 0) {
      throw new BadRequestException('At least one Passing RTO is required');
    }

    const hasGstDoc = Boolean(String(data?.gstNo || '').trim()) && Boolean(data?.gstCertificateUrl);
    const hasAadharDoc = Boolean(String(data?.aadharNumber || '').trim()) && Boolean(data?.aadharCardUrl);
    const hasTradeDoc = Boolean(String(data?.tradeCertificateNo || '').trim()) && Boolean(data?.tradeCertificateUrl);
    if (!hasGstDoc && !hasAadharDoc && !hasTradeDoc) {
      throw new BadRequestException('At least one verification document is required (GST, Aadhar, or Trade Certificate)');
    }
    if (hasTradeDoc && !data?.tradeValidity) {
      throw new BadRequestException('Trade validity is required when Trade Certificate is provided');
    }

    const existingDealer = await this.prisma.dealer.findUnique({ where: { phone } });
    if (existingDealer) {
      return { success: true, data: { id: null, status: 'EXISTS' } };
    }

    const existingPending = await this.prisma.dealerRegistrationRequest.findFirst({
      where: { phone, status: DealerRegistrationStatus.PENDING },
      orderBy: { createdAt: 'desc' }
    });
    if (existingPending) {
      return { success: true, data: { id: existingPending.id, status: 'PENDING' } };
    }

    const tradeCertificateUrl = data.tradeCertificateUrl
      ? await this.uploadFile(String(data.tradeCertificateUrl), 'dealer_req_trade')
      : null;
    const gstCertificateUrl = data.gstCertificateUrl
      ? await this.uploadFile(String(data.gstCertificateUrl), 'dealer_req_gst')
      : null;
    const aadharCardUrl = data.aadharCardUrl
      ? await this.uploadFile(String(data.aadharCardUrl), 'dealer_req_aadhar')
      : null;

    const tradeValidity = data.tradeValidity ? new Date(String(data.tradeValidity)) : null;

    const created = await this.prisma.dealerRegistrationRequest.create({
      data: {
        name: contactPersonName,
        firstName: firstName || null,
        lastName: lastName || null,
        email,
        dealerName,
        phone,
        stateCode: data.stateCode ? String(data.stateCode) : null,
        locationAddress: data.locationAddress ? String(data.locationAddress) : null,
        city: data.city ? String(data.city) : null,
        zip: data.zip ? String(data.zip) : null,
        latitude: data.latitude !== undefined && data.latitude !== null ? Number(data.latitude) : null,
        longitude: data.longitude !== undefined && data.longitude !== null ? Number(data.longitude) : null,
        radius: data.radius !== undefined && data.radius !== null ? Number(data.radius) : null,
        oemCodes,
        passingRtoCodes,
        gstNo: data.gstNo ? String(data.gstNo) : null,
        tradeCertificateNo: data.tradeCertificateNo ? String(data.tradeCertificateNo) : null,
        tradeValidity: tradeValidity && !isNaN(tradeValidity.getTime()) ? tradeValidity : null,
        aadharNumber: data.aadharNumber ? String(data.aadharNumber) : null,
        tradeCertificateUrl,
        gstCertificateUrl,
        aadharCardUrl,
        note: data.note ? String(data.note) : null
      } as any
    });

    return { success: true, data: { id: created.id, status: 'CREATED' } };
  }

  async listRegistrationRequests(status?: DealerRegistrationStatus) {
    return this.prisma.dealerRegistrationRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }

  async rejectRegistrationRequest(id: string, reviewedByUserId: string, note?: string) {
    const req = await this.prisma.dealerRegistrationRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Request not found');
    }
    if (req.status !== DealerRegistrationStatus.PENDING) {
      return { success: true };
    }

    await this.prisma.dealerRegistrationRequest.update({
      where: { id },
      data: {
        status: DealerRegistrationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByUserId,
        note: note ? String(note) : req.note
      }
    });
    return { success: true };
  }

  async approveRegistrationRequest(id: string, reviewedByUserId: string, payload: any) {
    const req = await this.prisma.dealerRegistrationRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Request not found');
    }
    const reqAny = req as any;
    if (req.status !== DealerRegistrationStatus.PENDING) {
      return { success: true, data: { dealerId: req.dealerId || null } };
    }

    const dealerExists = await this.prisma.dealer.findUnique({ where: { phone: req.phone } });
    if (dealerExists) {
      await this.prisma.dealerRegistrationRequest.update({
        where: { id },
        data: {
          status: DealerRegistrationStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedByUserId,
          dealerId: dealerExists.id
        }
      });
      return { success: true, data: { dealerId: dealerExists.id } };
    }

    const requestContactPersonName =
      [reqAny.firstName || '', reqAny.lastName || ''].map((s) => String(s).trim()).filter(Boolean).join(' ').trim() ||
      String(req.name || '').trim();
    const dataForDealer = {
      name: payload?.dealerName ?? payload?.name ?? reqAny.dealerName ?? req.name,
      contactPersonName: payload?.contactPersonName ?? requestContactPersonName,
      email: payload?.email ?? reqAny.email,
      phone: payload?.phone ?? req.phone,
      stateCode: payload?.stateCode ?? req.stateCode,
      locationAddress: payload?.locationAddress ?? req.locationAddress,
      city: payload?.city ?? req.city,
      zip: payload?.zip ?? req.zip,
      latitude: payload?.latitude ?? req.latitude,
      longitude: payload?.longitude ?? req.longitude,
      radius: payload?.radius ?? req.radius,
      gstNo: payload?.gstNo ?? req.gstNo,
      tradeCertificateNo: payload?.tradeCertificateNo ?? req.tradeCertificateNo,
      tradeValidity: payload?.tradeValidity ?? req.tradeValidity,
      aadharNumber: payload?.aadharNumber ?? req.aadharNumber,
      tradeCertificateUrl: payload?.tradeCertificateUrl ?? req.tradeCertificateUrl,
      gstCertificateUrl: payload?.gstCertificateUrl ?? req.gstCertificateUrl,
      aadharCardUrl: payload?.aadharCardUrl ?? req.aadharCardUrl,
      password: payload?.password,
      status: payload?.status ?? 'ACTIVE',
      oemCodes: Array.isArray(payload?.oemCodes) ? payload.oemCodes : Array.isArray(req.oemCodes) ? req.oemCodes : [],
      rtoCode: payload?.rtoCode,
      passingRtosAll:
        payload?.passingRtosAll !== undefined
          ? payload.passingRtosAll
          : Array.isArray(payload?.passingRtoCodes)
            ? payload.passingRtoCodes.length === 0
            : Array.isArray(reqAny.passingRtoCodes)
              ? reqAny.passingRtoCodes.length === 0
              : true,
      passingRtoCodes: Array.isArray(payload?.passingRtoCodes)
        ? payload.passingRtoCodes
        : Array.isArray(reqAny.passingRtoCodes)
          ? reqAny.passingRtoCodes
          : []
    };

    if (!dataForDealer.password) {
      throw new BadRequestException('password is required to approve');
    }
    if (!dataForDealer.stateCode) {
      throw new BadRequestException('stateCode is required to approve');
    }

    const dealer = await this.create(dataForDealer, reviewedByUserId);

    await this.prisma.dealerRegistrationRequest.update({
      where: { id },
      data: {
        status: DealerRegistrationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByUserId,
        dealerId: dealer.id
      }
    });

    return { success: true, data: { dealerId: dealer.id } };
  }
}
