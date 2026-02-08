import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException, UnauthorizedException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { S3Service } from '../s3/s3.service';
import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleImageCleanup() {
    // 1. Define threshold (10 minutes ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // 2. Find certificates that have not been cleaned up yet
    // We use a pragmatic check: if photoFrontLeft is not 'DELETED'
    const certificates = await this.prisma.certificate.findMany({
      where: {
        generatedAt: { lt: tenMinutesAgo },
        photoFrontLeft: { not: 'DELETED' }
      },
      take: 50 // Process in batches
    });

    if (certificates.length === 0) return;

    this.logger.log(`[Image Cleanup] Found ${certificates.length} certificates to clean up.`);

    for (const cert of certificates) {
      const filesToDelete = [
        cert.photoFrontLeft,
        cert.photoBackRight,
        cert.photoNumberPlate,
        cert.photoRc
      ];

      // Add QR Code Image to deletion list
      // We derive the path from one of the photo paths (assuming they are in the same directory)
      if (cert.photoFrontLeft && cert.photoFrontLeft !== 'DELETED') {
        try {
           const dir = path.dirname(cert.photoFrontLeft);
           const qrFilename = `${cert.certificateNumber}_QR.png`;
           const qrPath = path.join(dir, qrFilename);
           filesToDelete.push(qrPath);
        } catch (e) {
           this.logger.error(`[Image Cleanup] Failed to derive QR path for ${cert.certificateNumber}`, e);
        }
      }

      for (const filepath of filesToDelete) {
        // Only delete if it looks like a valid path (not 'DELETED') and exists
        if (filepath && filepath !== 'DELETED') {
           try {
             // Handle both relative and absolute paths if needed, but usually they are stored relative to root or absolute
             const fullPath = filepath.startsWith('/') ? path.join(process.cwd(), filepath) : path.resolve(filepath);
             
             if (fs.existsSync(fullPath)) {
               fs.unlinkSync(fullPath);
             }
           } catch (err) {
             this.logger.error(`[Image Cleanup] Failed to delete ${filepath}:`, err);
           }
        }
      }

      // 3. Update DB to mark as DELETED
      await this.prisma.certificate.update({
        where: { id: cert.id },
        data: {
          photoFrontLeft: 'DELETED',
          photoBackRight: 'DELETED',
          photoNumberPlate: 'DELETED',
          photoRc: 'DELETED'
        }
      });
    }
  }

  async publicVerify(params: { url?: string; state?: string; oem?: string; product?: string; value?: string }) {
    let qrState = params.state || null;
    let qrOem = params.oem || null;
    let qrProduct = params.product || null;
    let qrValue = params.value || null;
    if (params.url) {
      let parsed: URL;
      try {
        parsed = new URL(params.url);
      } catch {
        throw new BadRequestException('Invalid QR Code Format: Not a valid URL');
      }
      const allowedDomains = ['smartvahan.com', 'www.smartvahan.com', 'smartvahan.net', 'www.smartvahan.net', 'localhost', '127.0.0.1'];
      if (process.env.BASE_DOMAIN) allowedDomains.push(process.env.BASE_DOMAIN);
      const isDomainValid = allowedDomains.some(d => parsed.hostname.includes(d));
      if (!isDomainValid) throw new BadRequestException('Invalid QR Code: Unauthorized Domain');
      const parts = parsed.pathname.split('/').filter(p => p.length > 0);
      if (parts.length < 4) throw new BadRequestException('Invalid QR Code Format: URL structure mismatch');
      const last = parts[parts.length - 1];
      if (!last.startsWith('qr=')) throw new BadRequestException('Invalid QR Code Format: Missing qr param');
      qrValue = last.split('=')[1];
      qrProduct = parts[parts.length - 2];
      qrOem = parts[parts.length - 3];
      qrState = parts[parts.length - 4];
    } else {
      if (!qrState || !qrOem || !qrProduct || !qrValue) {
        throw new BadRequestException('Invalid QR Code Format: Missing State/OEM/Product/Value');
      }
    }
    const qrCode = await this.prisma.qRCode.findUnique({
      where: { value: qrValue! },
      include: { batch: { include: { oem: true, state: true, product: true } } }
    });
    if (!qrCode) throw new BadRequestException('Invalid QR Code');
    if (qrCode.batch.state.code !== qrState || qrCode.batch.oem.code !== qrOem || qrCode.batch.product.code !== qrProduct) {
      throw new BadRequestException('Security Alert: QR metadata mismatch');
    }
    if (qrCode.status === 0) {
      return {
        success: true,
        status: 'UNUSED',
        data: {
          id: qrCode.id,
          serialNumber: qrCode.serialNumber,
          value: qrCode.value,
          stateCode: qrCode.batch.state.code,
          oemCode: qrCode.batch.oem.code,
          productCode: qrCode.batch.product.code,
          batchId: qrCode.batch.batchId
        }
      };
    }
    const certificate = await this.prisma.certificate.findUnique({
      where: { qrCodeId: qrCode.id }
    });
    if (!certificate) {
      return {
        success: true,
        status: 'UNUSED',
        data: {
          id: qrCode.id,
          serialNumber: qrCode.serialNumber,
          value: qrCode.value,
          stateCode: qrCode.batch.state.code,
          oemCode: qrCode.batch.oem.code,
          productCode: qrCode.batch.product.code,
          batchId: qrCode.batch.batchId
        }
      };
    }
    let pdfUrl: string | null = null;
    if (certificate.pdfPath) {
      if (certificate.pdfPath.startsWith('http')) {
        pdfUrl = certificate.pdfPath;
      } else {
        const idx = certificate.pdfPath.indexOf('uploads');
        if (idx >= 0) {
          pdfUrl = '/' + certificate.pdfPath.substring(idx).replace(/\\/g, '/');
        }
      }
    }
    return {
      success: true,
      status: 'VALID',
      data: {
        certificateNumber: certificate.certificateNumber,
        vehicleMake: certificate.vehicleMake,
        vehicleCategory: certificate.vehicleCategory,
        fuelType: certificate.fuelType,
        passingRto: certificate.passingRto,
        registrationRto: certificate.registrationRto,
        series: certificate.series,
        manufacturingYear: certificate.manufacturingYear,
        chassisNumber: certificate.chassisNumber,
        engineNumber: certificate.engineNumber,
        ownerName: certificate.ownerName,
        ownerContact: certificate.ownerContact,
        photoFrontLeft: certificate.photoFrontLeft,
        photoBackRight: certificate.photoBackRight,
        photoNumberPlate: certificate.photoNumberPlate,
        photoRc: certificate.photoRc,
        pdfUrl,
        vehicleNumber: certificate.vehicleNumber,
        generatedAt: certificate.generatedAt,
        locationText: certificate.locationText,
        qr: {
          serialNumber: qrCode.serialNumber,
          value: qrCode.value,
          stateCode: qrCode.batch.state.code,
          oemCode: qrCode.batch.oem.code,
          productCode: qrCode.batch.product.code,
          batchId: qrCode.batch.batchId
        }
      }
    };
  }

  async searchQrBySerial(params: { state: string; oem: string; serial: string; baseUrl: string }) {
    const state = params.state?.trim();
    const oem = params.oem?.trim();
    const serialNumber = Number(params.serial);
    if (!state || !oem || !params.serial) {
      throw new BadRequestException('state, oem and serial are required');
    }
    if (!Number.isFinite(serialNumber) || serialNumber <= 0) {
      throw new BadRequestException('Serial must be a positive number');
    }

    const qrCode = await this.prisma.qRCode.findFirst({
      where: {
        serialNumber,
        batch: {
          stateCode: state,
          oemCode: oem
        }
      },
      include: {
        batch: {
          include: {
            state: true,
            oem: true,
            product: true
          }
        },
        certificate: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!qrCode) {
      throw new NotFoundException('QR Code not found for given State, OEM and Serial');
    }

    const cleanBase = params.baseUrl.endsWith('/') ? params.baseUrl.slice(0, -1) : params.baseUrl;
    const fullUrl = `${cleanBase}/${qrCode.batch.state.code}/${qrCode.batch.oem.code}/${qrCode.batch.product.code}/qr=${qrCode.value}`;
    const qrImageDataUrl = await QRCode.toDataURL(fullUrl, { errorCorrectionLevel: 'H', margin: 1 });

    if (!qrCode.certificate) {
      return {
        success: true,
        status: 'UNUSED',
        data: {
          id: qrCode.id,
          serialNumber: qrCode.serialNumber,
          value: qrCode.value,
          stateCode: qrCode.batch.state.code,
          oemCode: qrCode.batch.oem.code,
          productCode: qrCode.batch.product.code,
          batchId: qrCode.batch.batchId,
          qrImageDataUrl
        }
      };
    }

    let pdfUrl: string | null = null;
    if (qrCode.certificate.pdfPath) {
      const idx = qrCode.certificate.pdfPath.indexOf('uploads');
      if (idx >= 0) {
        pdfUrl = '/' + qrCode.certificate.pdfPath.substring(idx).replace(/\\/g, '/');
      }
    }

    return {
      success: true,
      status: 'USED',
      data: {
        id: qrCode.id,
        serialNumber: qrCode.serialNumber,
        value: qrCode.value,
        stateCode: qrCode.batch.state.code,
        oemCode: qrCode.batch.oem.code,
        productCode: qrCode.batch.product.code,
        batchId: qrCode.batch.batchId,
        certificate: {
          certificateNumber: qrCode.certificate.certificateNumber,
          vehicleNumber: qrCode.certificate.vehicleNumber,
          generatedAt: qrCode.certificate.generatedAt,
          pdfUrl
        }
      }
    };
  }

  async searchCertificate(params: {
    state: string;
    oem: string;
    by: 'QR_SERIAL' | 'VEHICLE' | 'CERTIFICATE';
    serial?: string;
    registrationRto?: string;
    series?: string;
    certificateNumber?: string;
    isGhost?: boolean;
  }) {
    const state = params.state?.trim();
    const oem = params.oem?.trim();
    const isGhost = params.isGhost || false;

    if (!state || !oem) {
      throw new BadRequestException('state and oem are required');
    }

    let certificate = null as any;
    let qrCode = null as any;

    if (params.by === 'QR_SERIAL') {
      const serialNumber = Number(params.serial);
      if (!params.serial) {
        throw new BadRequestException('serial is required for QR_SERIAL search');
      }
      if (!Number.isFinite(serialNumber) || serialNumber <= 0) {
        throw new BadRequestException('Serial must be a positive number');
      }

      qrCode = await this.prisma.qRCode.findFirst({
        where: {
          serialNumber,
          batch: {
            stateCode: state,
            oemCode: oem,
            isGhost: isGhost
          }
        },
        include: {
          certificate: true,
          batch: {
            include: {
              state: true,
              oem: true,
              product: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!qrCode || !qrCode.certificate) {
        throw new NotFoundException('Certificate not found for given QR Code');
      }

      certificate = qrCode.certificate;
    } else if (params.by === 'VEHICLE') {
      const registrationRto = params.registrationRto?.trim();
      const series = params.series?.trim();
      if (!registrationRto || !series) {
        throw new BadRequestException('registrationRto and series are required for VEHICLE search');
      }

      certificate = await this.prisma.certificate.findFirst({
        where: {
          registrationRto,
          series,
          qrCode: {
            batch: {
              stateCode: state,
              oemCode: oem,
              isGhost: isGhost
            }
          }
        },
        include: {
          qrCode: {
            include: {
              batch: {
                include: {
                  state: true,
                  oem: true,
                  product: true
                }
              }
            }
          }
        },
        orderBy: {
          generatedAt: 'desc'
        }
      });

      if (!certificate) {
        throw new NotFoundException('Certificate not found for given vehicle details');
      }

      qrCode = certificate.qrCode;
    } else if (params.by === 'CERTIFICATE') {
      const certificateNumber = params.certificateNumber?.trim();
      if (!certificateNumber) {
        throw new BadRequestException('certificateNumber is required for CERTIFICATE search');
      }

      certificate = await this.prisma.certificate.findFirst({
        where: {
          certificateNumber,
          qrCode: {
            batch: {
              stateCode: state,
              oemCode: oem,
              isGhost: isGhost
            }
          }
        },
        include: {
          qrCode: {
            include: {
              batch: {
                include: {
                  state: true,
                  oem: true,
                  product: true
                }
              }
            }
          }
        },
        orderBy: {
          generatedAt: 'desc'
        }
      });

      if (!certificate) {
        throw new NotFoundException('Certificate not found for given certificate number');
      }

      qrCode = certificate.qrCode;
    } else {
      throw new BadRequestException('Invalid search mode');
    }

    let pdfUrl: string | null = null;
    if (certificate.pdfPath) {
      const idx = certificate.pdfPath.indexOf('uploads');
      if (idx >= 0) {
        pdfUrl = '/' + certificate.pdfPath.substring(idx).replace(/\\/g, '/');
      }
    }

    return {
      success: true,
      data: {
        certificateNumber: certificate.certificateNumber,
        vehicleMake: certificate.vehicleMake,
        vehicleCategory: certificate.vehicleCategory,
        fuelType: certificate.fuelType,
        passingRto: certificate.passingRto,
        registrationRto: certificate.registrationRto,
        series: certificate.series,
        manufacturingYear: certificate.manufacturingYear,
        chassisNumber: certificate.chassisNumber,
        engineNumber: certificate.engineNumber,
        ownerName: certificate.ownerName,
        ownerContact: certificate.ownerContact,
        vehicleNumber: certificate.vehicleNumber,
        generatedAt: certificate.generatedAt,
        locationText: certificate.locationText,
        pdfUrl,
        qr: {
          serialNumber: qrCode.serialNumber,
          value: qrCode.value,
          stateCode: qrCode.batch.state.code,
          oemCode: qrCode.batch.oem.code,
          productCode: qrCode.batch.product.code,
          batchId: qrCode.batch.batchId
        }
      }
    };
  }

  async listCertificatesForDownload(params: { state?: string; oem?: string; from?: string; to?: string; user?: any; isGhost?: boolean }) {
    const where: any = {};
    const user = params.user;
    const isGhost = params.isGhost || false;

    if (user && (user.role === 'DEALER' || user.role === 'DEALER_USER')) {
      where.dealerId = user.userId;
    }

    if (params.from || params.to) {
      where.generatedAt = {};
      if (params.from) {
        const fromDate = new Date(params.from);
        if (!isNaN(fromDate.getTime())) {
          where.generatedAt.gte = fromDate;
        }
      }
      if (params.to) {
        const toDate = new Date(params.to);
        if (!isNaN(toDate.getTime())) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          where.generatedAt.lte = end;
        }
      }
      if (Object.keys(where.generatedAt).length === 0) {
        delete where.generatedAt;
      }
    }

    const qrWhere: any = {};
    const batchWhere: any = {};
    if (params.state) {
      batchWhere.stateCode = params.state;
    }
    if (params.oem) {
      batchWhere.oemCode = params.oem;
    }
    
    // Ghost Filter
    batchWhere.isGhost = isGhost;

    if (Object.keys(batchWhere).length > 0) {
      qrWhere.batch = {
        ...(qrWhere.batch || {}),
        ...batchWhere
      };
    }
    if (Object.keys(qrWhere).length > 0) {
      where.qrCode = qrWhere;
    }

    const certificates = await this.prisma.certificate.findMany({
      where,
      include: {
        qrCode: {
          include: {
            batch: {
              include: {
                oem: true,
                product: true,
                state: true
              }
            }
          }
        },
        dealer: true
      },
      orderBy: {
        generatedAt: 'desc'
      }
    });

    return {
      success: true,
      data: certificates.map((c) => {
        let pdfUrl: string | null = null;
        if (c.pdfPath) {
          if (c.pdfPath.startsWith('http')) {
            pdfUrl = c.pdfPath;
          } else {
            const idx = c.pdfPath.indexOf('uploads');
            if (idx >= 0) {
              pdfUrl = '/' + c.pdfPath.substring(idx).replace(/\\/g, '/');
            }
          }
        }
        return {
          id: c.id,
          generationDate: c.generatedAt,
          state: c.qrCode.batch.state?.name || c.qrCode.batch.stateCode,
          oem: c.qrCode.batch.oem?.name || c.qrCode.batch.oemCode,
          product: c.qrCode.batch.product?.name || c.qrCode.batch.productCode,
          qrSerial: c.qrCode.serialNumber,
          certificateNumber: c.certificateNumber,
          vehicleNumber: c.vehicleNumber,
          passingRto: c.passingRto,
          ownerName: c.ownerName,
          dealerName: c.dealer ? c.dealer.name : null,
          dealerUserId: c.dealer ? c.dealer.phone : null,
          pdfUrl
        };
      })
    };
  }

  async validateQr(qrContent: string, user: any) {
    // Fetch full user/dealer details for authorization
    let dbUser: any = null;
    let authorizedState: string | null = null;
    let authorizedOems: string[] = []; // List of authorized OEM codes
    let isSuperAdmin = false;

    if (user.role === 'DEALER_USER' || user.role === 'DEALER') {
        dbUser = await this.prisma.dealer.findUnique({
            where: { id: user.userId },
            include: { oems: true }
        });
        if (!dbUser) throw new UnauthorizedException('Dealer account not found');
        if (dbUser.status !== 'ACTIVE') throw new UnauthorizedException('Dealer account is inactive');
        
        authorizedState = dbUser.stateCode;
        authorizedOems = dbUser.oems.map(o => o.code);
    } else {
        // System User
        dbUser = await this.prisma.user.findUnique({ where: { id: user.userId } });
        if (!dbUser) throw new UnauthorizedException('User account not found');
        
        if (dbUser.role === 'SUPER_ADMIN') {
            isSuperAdmin = true;
        } else if (dbUser.role === 'STATE_ADMIN') {
            authorizedState = dbUser.stateCode;
            // State Admin typically manages all OEMs in their state, or restricted?
            // Assuming full access within state unless oemCode is set
            if (dbUser.oemCode) authorizedOems = [dbUser.oemCode];
        } else if (dbUser.role === 'OEM_ADMIN') {
            if (dbUser.oemCode) authorizedOems = [dbUser.oemCode];
            if (dbUser.stateCode) authorizedState = dbUser.stateCode;
        }
    }

    // 1. Domain Validation
    // Validate {DOMAIN} embedded in QR
    let url: URL;
    try {
        url = new URL(qrContent);
    } catch (e) {
        // If not a URL, try to see if it's just the value (Legacy support or manual entry)
        // But user insists on Domain/State/Brand validation from QR content.
        // If it's just a value, we can't validate those without DB lookup.
        // However, we'll try to support legacy by skipping step 1-3 ONLY IF it looks like a value?
        // NO, User said "MANDATORY" sequence.
        // We will throw error if not a valid URL.
        throw new BadRequestException('Invalid QR Code Format: Not a valid URL');
    }

    const allowedDomains = [
        'smartvahan.com', 
        'www.smartvahan.com',
        'smartvahan.net',
        'www.smartvahan.net',
        'localhost', 
        '127.0.0.1'
    ];
    // Add configured domain from env
    if (process.env.BASE_DOMAIN) allowedDomains.push(process.env.BASE_DOMAIN);

    const isDomainValid = allowedDomains.some(d => url.hostname.includes(d));
    if (!isDomainValid) {
         throw new BadRequestException('Invalid QR Code: Unauthorized Domain');
    }

    // Parse URL Structure: .../{STATE}/{OEM}/{PRODUCT}/qr={VALUE}
    // We expect at least 4 segments in path
    const pathParts = url.pathname.split('/').filter(p => p.length > 0);
    if (pathParts.length < 4) {
        throw new BadRequestException('Invalid QR Code Format: URL structure mismatch');
    }

    // Locate segments (Assuming standard structure generated by QrService)
    // Structure: uploads/QR/{STATE}/{OEM} -> This is for PDF file path.
    // QR Content URL: {Base}/{STATE}/{OEM}/{PRODUCT}/qr={VALUE}
    // So indices: 0=State, 1=OEM, 2=Product, 3=qr=Value (Last one)
    
    // We grab the last part for value, and 3 parts before it.
    const qrValuePart = pathParts[pathParts.length - 1];
    if (!qrValuePart.startsWith('qr=')) {
         throw new BadRequestException('Invalid QR Code Format: Missing qr param');
    }
    const qrValue = qrValuePart.split('=')[1];
    
    // Assuming standard structure relative to end
    const qrProduct = pathParts[pathParts.length - 2];
    const qrOem = pathParts[pathParts.length - 3];
    const qrState = pathParts[pathParts.length - 4];

    if (!qrState || !qrOem || !qrProduct) {
        throw new BadRequestException('Invalid QR Code Format: Missing State/OEM/Product in URL');
    }

    // 2. State Authorization Validation
    if (!isSuperAdmin) {
        if (authorizedState && authorizedState !== qrState) {
             throw new BadRequestException(`Invalid QR Code: You are not authorized for State ${qrState}`);
        }
    }

    // 3. Brand (OEM) Validation
    if (!isSuperAdmin) {
        // For Dealers, strict check against authorized OEMs list
        if (user.role === 'DEALER_USER' || user.role === 'DEALER') {
             if (!authorizedOems.includes(qrOem)) {
                 throw new BadRequestException(`Invalid QR Code: You are not authorized for Brand ${qrOem}`);
             }
        } else {
             // For System Users (e.g. OEM Admin)
             if (authorizedOems.length > 0 && !authorizedOems.includes(qrOem)) {
                  throw new BadRequestException(`Invalid QR Code: You are not authorized for Brand ${qrOem}`);
             }
        }
    }

    // 4. QR Serial Validation (Existence)
    // Validate {ENCRYPTED_UNIQUE_SERIAL} -> We use 'value' as the unique identifier
    const qrCode = await this.prisma.qRCode.findUnique({
      where: { value: qrValue },
      include: {
        batch: {
          include: {
            oem: true,
            state: true,
            product: true
          }
        }
      }
    });

    if (!qrCode) {
      throw new NotFoundException('QR Code not found (Invalid Serial)');
    }

    // Extra Safety: Verify that the URL metadata matches the DB Record
    if (qrCode.batch.state.code !== qrState) {
        throw new BadRequestException('Security Alert: QR State code does not match database record');
    }
    if (qrCode.batch.oem.code !== qrOem) {
        throw new BadRequestException('Security Alert: QR Brand code does not match database record');
    }

    if (qrCode.status !== 0) {
      throw new BadRequestException('QR Code already used');
    }

    // If all checks pass:
    return {
      success: true,
      data: {
        id: qrCode.id,
        serialNumber: qrCode.serialNumber,
        value: qrCode.value,
        oem: qrCode.batch.oem.name,
        state: qrCode.batch.state.name,
        stateCode: qrCode.batch.state.code,
        product: qrCode.batch.product.name,
        batchId: qrCode.batch.batchId
      }
    };
  }

  async validateQrByValue(qrValue: string, user: any) {
    let dbUser: any = null;
    let authorizedState: string | null = null;
    let authorizedOems: string[] = [];
    let isSuperAdmin = false;

    if (user.role === 'DEALER_USER' || user.role === 'DEALER') {
        dbUser = await this.prisma.dealer.findUnique({
            where: { id: user.userId },
            include: { oems: true }
        });
        if (!dbUser) throw new UnauthorizedException('Dealer account not found');
        if (dbUser.status !== 'ACTIVE') throw new UnauthorizedException('Dealer account is inactive');
        
        authorizedState = dbUser.stateCode;
        authorizedOems = dbUser.oems.map(o => o.code);
    } else {
        dbUser = await this.prisma.user.findUnique({ where: { id: user.userId } });
        if (!dbUser) throw new UnauthorizedException('User account not found');
        
        if (dbUser.role === 'SUPER_ADMIN') {
            isSuperAdmin = true;
        } else if (dbUser.role === 'STATE_ADMIN') {
            authorizedState = dbUser.stateCode;
            if (dbUser.oemCode) authorizedOems = [dbUser.oemCode];
        } else if (dbUser.role === 'OEM_ADMIN') {
            if (dbUser.oemCode) authorizedOems = [dbUser.oemCode];
            if (dbUser.stateCode) authorizedState = dbUser.stateCode;
        }
    }

    const qrCode = await this.prisma.qRCode.findUnique({
      where: { value: qrValue },
      include: {
        batch: {
          include: {
            oem: true,
            state: true,
            product: true
          }
        }
      }
    });

    if (!qrCode) {
      throw new NotFoundException('QR Code not found (Invalid Serial)');
    }

    if (!isSuperAdmin) {
        const qrState = qrCode.batch.state.code;
        const qrOem = qrCode.batch.oem.code;
        if (authorizedState && authorizedState !== qrState) {
             throw new BadRequestException(`Invalid QR Code: You are not authorized for State ${qrState}`);
        }
        if (user.role === 'DEALER_USER' || user.role === 'DEALER') {
             if (!authorizedOems.includes(qrOem)) {
                 throw new BadRequestException(`Invalid QR Code: You are not authorized for Brand ${qrOem}`);
             }
        } else {
             if (authorizedOems.length > 0 && !authorizedOems.includes(qrOem)) {
                  throw new BadRequestException(`Invalid QR Code: You are not authorized for Brand ${qrOem}`);
             }
        }
    }

    if (qrCode.status !== 0) {
      throw new BadRequestException('QR Code already used');
    }

    return {
      success: true,
      data: {
        id: qrCode.id,
        serialNumber: qrCode.serialNumber,
        value: qrCode.value,
        oem: qrCode.batch.oem.name,
        state: qrCode.batch.state.name,
        stateCode: qrCode.batch.state.code,
        product: qrCode.batch.product.name,
        batchId: qrCode.batch.batchId
      }
    };
  }

  async createCertificate(data: any) {
    console.log("createCertificate called with keys:", data ? Object.keys(data) : 'null');
    console.log("createCertificate dealerId:", data.dealerId);
    
    // Handle potential flat structure from frontend
    const qrValue = data.qrValue;
    const locationText = data.locationText || '';
    const systemLogo = data.systemLogo;
    const systemName = data.systemName;
    const dealerId = data.dealerId || null;
    const qrCodeImageBase64 = data.qrCodeImage;

    const vehicleDetails = data.vehicleDetails || {
        vehicleMake: data.vehicleMake,
        vehicleCategory: data.vehicleCategory,
        fuelType: data.fuelType,
        passingRto: data.passingRto,
        registrationRto: data.registrationRto,
        series: data.series,
        manufacturingYear: data.manufacturingYear,
        chassisNo: data.chassisNo,
        engineNo: data.engineNo
    };

    const ownerDetails = data.ownerDetails || {
        ownerName: data.ownerName,
        ownerContact: data.ownerContact
    };

    let dealerDetails: { name: string; tradeCertificateNo: string; gstNo: string; tradeValidity: string | null; aadharNumber: string | null } = {
        name: 'NA',
        tradeCertificateNo: 'NA',
        gstNo: 'NA',
        tradeValidity: null,
        aadharNumber: null
    };

    if (dealerId) {
        console.log("Fetching dealer details for ID:", dealerId);
        const dealer = await this.prisma.dealer.findUnique({ where: { id: dealerId } });
        if (dealer) {
            console.log("Dealer found:", dealer.name);
            dealerDetails = {
                name: dealer.name,
                tradeCertificateNo: dealer.tradeCertificateNo || 'NA',
                gstNo: dealer.gstNo || 'NA',
                tradeValidity: dealer.tradeValidity ? dealer.tradeValidity.toISOString() : null,
                aadharNumber: dealer.aadharNumber || null
            };
        } else {
            console.log("Dealer not found for ID:", dealerId);
        }
    } else if (data.dealerDetails) {
        console.log("Using provided dealerDetails from payload");
        dealerDetails = {
            name: data.dealerDetails.name || 'NA',
            tradeCertificateNo: data.dealerDetails.tradeCertificateNo || 'NA',
            gstNo: data.dealerDetails.gstNo || 'NA',
            tradeValidity: data.dealerDetails.tradeValidity || null,
            aadharNumber: data.dealerDetails.aadharNumber || null
        };
    }
    
    console.log("Final Dealer Details for PDF:", dealerDetails);

    const photos = data.photos || {
        photoFrontLeft: data.photoFrontLeft,
        photoBackRight: data.photoBackRight,
        photoNumberPlate: data.photoNumberPlate,
        photoRc: data.photoRc
    };

    if (!qrValue || !vehicleDetails || !ownerDetails || !photos) {
        throw new BadRequestException('Missing required fields: qrValue, vehicleDetails, ownerDetails, or photos');
    }

    // 1. Fetch QR and related data
    const qrCode = await this.prisma.qRCode.findUnique({
      where: { value: qrValue },
      include: {
        batch: {
          include: {
            oem: true,
            state: true,
            product: true
          }
        }
      }
    });

    if (!qrCode) throw new NotFoundException('QR Code not found');
    if (qrCode.status !== 0) throw new BadRequestException('QR Code already used');

    // If system branding not provided from client, load from SystemSettings
    let finalSystemName = systemName;
    let finalSystemLogo = systemLogo;
    if (!finalSystemName || !finalSystemLogo) {
        const settings = await this.prisma.systemSettings.findUnique({
            where: { id: 'SYSTEM_SETTINGS' }
        });
        if (settings) {
            if (!finalSystemName) finalSystemName = settings.systemName;
            if (!finalSystemLogo && settings.systemLogo) finalSystemLogo = settings.systemLogo;
        }
    }

    // 2. Generate Certificate Number
    // Format: {passingRto}{value} as requested
    const certNumber = `${vehicleDetails.passingRto}${qrCode.value}`;

    // 3. Define Paths
    const stateCode = qrCode.batch.state.code;
    const oemCode = qrCode.batch.oem.code;
    const productCode = qrCode.batch.product.code;
    
    // QR Content: {Base URL}/{STATE}/{OEM}/{MATERIAL}/qr={VALUE}
    const baseUrl = process.env.BASE_URL || 'https://smartvahan.com';
    const qrContent = `${baseUrl}/${stateCode}/${oemCode}/${productCode}/qr=${qrCode.value}`;

    // Uploads structure: uploads/{STATE}/{OEM}/{PRODUCT}/
    const baseUploadDir = path.join(process.cwd(), 'uploads', stateCode, oemCode, productCode);
    if (!fs.existsSync(baseUploadDir)) {
      fs.mkdirSync(baseUploadDir, { recursive: true });
    }

    // 4. Save Images
    const saveImage = (base64Data: string, name: string) => {
      try {
        if (!base64Data) {
            console.error(`Missing base64 data for ${name}`);
            return null;
        }
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            console.error(`Invalid base64 format for ${name}`);
            return null;
        }
        
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${certNumber}_${name}.jpg`;
        const filepath = path.join(baseUploadDir, filename);
        fs.writeFileSync(filepath, buffer);
        return filepath; 
      } catch (e) {
        console.error(`Error saving image ${name}:`, e);
        throw e;
      }
    };

    try {
        const photoPaths = {
            photoFrontLeft: saveImage(photos.photoFrontLeft, 'FrontLeft'),
            photoBackRight: saveImage(photos.photoBackRight, 'BackRight'),
            photoNumberPlate: saveImage(photos.photoNumberPlate, 'NumberPlate'),
            photoRc: saveImage(photos.photoRc, 'RC')
        };
        
        // Generate QR Code Image from value (Ensure it exists and is high quality)
        let qrCodeImagePath = null;
        try {
            const qrFilename = `${certNumber}_QR.png`;
            qrCodeImagePath = path.join(baseUploadDir, qrFilename);
            await QRCode.toFile(qrCodeImagePath, qrContent, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
        } catch (e) {
            console.error("Failed to generate QR Code image:", e);
        }

        // Check if any image failed (returned null) - this would cause Prisma error
        if (!photoPaths.photoFrontLeft || !photoPaths.photoBackRight || !photoPaths.photoNumberPlate || !photoPaths.photoRc) {
            throw new InternalServerErrorException("Failed to save one or more images. Invalid format.");
        }

        // 5. Generate PDF
        // Format: {Vehicle Number}-{passingRto}{qrValue}.pdf
        const vehicleNumber = `${vehicleDetails.registrationRto}${vehicleDetails.series}`;
        const pdfFilename = `${vehicleNumber}-${certNumber}.pdf`;
        const pdfPath = path.join(baseUploadDir, pdfFilename);
        
        await this.generatePdf(pdfPath, {
            certNumber,
            qrCode,
            vehicleDetails,
            ownerDetails,
            photos: photoPaths,
            locationText,
            generatedAt: new Date(),
            systemLogo: finalSystemLogo,
            systemName: finalSystemName,
            qrCodeImagePath,
            dealerName: dealerDetails.name,
            tradeCertificateNo: dealerDetails.tradeCertificateNo,
            gstNo: dealerDetails.gstNo,
            aadharNumber: dealerDetails.aadharNumber,
            tradeValidity: dealerDetails.tradeValidity
                ? new Date(dealerDetails.tradeValidity).toLocaleDateString('en-GB').replace(/\//g, '-')
                : ''
        });

        // S3 Upload Logic
        let finalPdfPath = pdfPath;
        const s3Key = `certificates/${stateCode}/${oemCode}/${productCode}/${pdfFilename}`;
        const s3Url = await this.s3Service.uploadFile(pdfPath, s3Key);
        if (s3Url) {
            finalPdfPath = s3Url;
            // Optionally delete local file if S3 upload successful to save space
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (e) {
                console.error("Failed to delete local PDF after S3 upload", e);
            }
        }

        // 6. Save to DB
        
        // Determine count based on Ghost Mode (Original=1, Ghost=0)
        const count = qrCode.batch.isGhost ? 0 : 1;

        console.log("Starting Transaction for Certificate Creation...");

        // Use transaction to update QR status and create certificate
        const cert = await this.prisma.$transaction(async (tx) => {
            await tx.qRCode.update({
            where: { id: qrCode.id },
            data: { status: 1 }
            });

            return await tx.certificate.create({
            data: {
                certificateNumber: certNumber,
                qrCodeId: qrCode.id,
                vehicleMake: vehicleDetails.vehicleMake,
                vehicleCategory: vehicleDetails.vehicleCategory,
                fuelType: vehicleDetails.fuelType,
                passingRto: vehicleDetails.passingRto,
                registrationRto: vehicleDetails.registrationRto,
                series: vehicleDetails.series,
                manufacturingYear: vehicleDetails.manufacturingYear,
                chassisNumber: vehicleDetails.chassisNo,
                engineNumber: vehicleDetails.engineNo,
                ownerName: ownerDetails.ownerName,
                ownerContact: ownerDetails.ownerContact,
                photoFrontLeft: photoPaths.photoFrontLeft!,
                photoBackRight: photoPaths.photoBackRight!,
                photoNumberPlate: photoPaths.photoNumberPlate!,
                photoRc: photoPaths.photoRc!,
                pdfPath: finalPdfPath,
                locationText: locationText,
                vehicleNumber: vehicleNumber,
                count: count,
                dealerId: dealerId
            }
            });
        });

        return {
            success: true,
            message: 'Certificate Generated Successfully',
            pdfUrl: finalPdfPath.startsWith('http') ? finalPdfPath : `/uploads/${stateCode}/${oemCode}/${productCode}/${pdfFilename}`,
            certificateId: cert.id
        };
    } catch (error) {
        console.error("Error in createCertificate:", error);
        fs.appendFileSync(path.join(process.cwd(), 'create_cert_error.log'), `${new Date().toISOString()} - ${error.message}\n${error.stack}\n\n`);
        throw new InternalServerErrorException("Failed to generate certificate: " + (error.message || error));
    }
  }

  private async generatePdf(outputPath: string, data: any) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 20 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const startX = 20;
      let currentY = 20;
      const fullWidth = 555; // A4 (595) - 40 margin
      const contentWidth = fullWidth;

      // --- Helper Functions ---
      const resolveLogoPath = (logo: string) => {
        let value = logo;
        if (value.startsWith('http://') || value.startsWith('https://')) {
          try {
            const url = new URL(value);
            value = url.pathname || value;
          } catch {
          }
        }
        if (value.startsWith('/uploads') || value.startsWith('uploads')) {
          return path.join(process.cwd(), value.startsWith('/') ? value.substring(1) : value);
        }
        return null;
      };

      const drawGreyHeader = (text: string, y: number) => {
        doc.rect(startX, y, contentWidth, 20).fill('#E0E0E0');
        doc.fillColor('black').font('Helvetica-Bold').fontSize(10)
           .text(text, startX, y + 5, { align: 'center', width: contentWidth });
        return y + 25;
      };

      const drawField = (label: string, value: string, x: number, y: number, w: number, isBoldValue = true) => {
        // Label
        doc.fillColor('black').font('Helvetica').fontSize(9)
           .text(label.toUpperCase(), x, y, { width: w * 0.4, align: 'left' });
        // Colon
        doc.text(':', x + (w * 0.4), y, { width: 10, align: 'center' });
        // Value
        const val = value ? String(value).toUpperCase() : '-';
        doc.font(isBoldValue ? 'Helvetica-Bold' : 'Helvetica')
           .text(val, x + (w * 0.4) + 10, y, { width: (w * 0.6) - 10, align: 'left' });
      };

      // ================= HEADER =================
      const headerHeight = 90;
      doc.rect(startX, currentY, contentWidth, headerHeight).fill('#E0E0E0');
      
      const logoMaxHeight = 60; 
      const logoMaxWidth = 100;
      const logoY = currentY + (headerHeight - logoMaxHeight) / 2;

      // OEM Logo (Left)
      if (data.qrCode.batch.oem.logo) {
          try {
              const logo = data.qrCode.batch.oem.logo;
              const fsPath = resolveLogoPath(logo);
              if (fsPath) {
                   doc.image(fsPath, startX + 10, logoY, { fit: [logoMaxWidth, logoMaxHeight], align: 'center', valign: 'center' });
              } else {
                  let logoData = logo;
                  if (logoData.startsWith('data:')) logoData = logoData.split(',')[1];
                  doc.image(Buffer.from(logoData, 'base64'), startX + 10, logoY, { fit: [logoMaxWidth, logoMaxHeight], align: 'center', valign: 'center' });
              }
          } catch (e) {
               console.error("OEM Logo Error", e);
          }
      }

      // Center Text
      const centerX = startX;
      // Calculate vertical centering for text block
      // Block Height approx: 16 (Title) + 4 (Gap) + 11 (System) + 4 (Gap) + 13 (RTO) = ~48 points
      const textBlockHeight = 48;
      const textStartY = currentY + (headerHeight - textBlockHeight) / 2;

      doc.fillColor('black');
      doc.font('Helvetica-Bold').fontSize(16).text('INSTALLATION CERTIFICATE', centerX, textStartY, { align: 'center', width: contentWidth });
      // Base URL or System Name
      doc.fontSize(11).text((data.systemName || 'SMART VAHAN').toUpperCase(), centerX, textStartY + 20, { align: 'center', width: contentWidth });
      // Registration RTO Series (Title/Number)
      const rtoSeries = `${data.vehicleDetails.registrationRto}-${data.vehicleDetails.series}`.toUpperCase(); 
      doc.fontSize(13).text(rtoSeries, centerX, textStartY + 35, { align: 'center', width: contentWidth });

      // System Logo (Right)
      if (data.systemLogo) {
          try {
              const fsPath = resolveLogoPath(data.systemLogo);
              if (fsPath) {
                // Align right: x = startX + contentWidth - logoMaxWidth - 10
                doc.image(fsPath, startX + contentWidth - (logoMaxWidth + 10), logoY, { fit: [logoMaxWidth, logoMaxHeight], align: 'center', valign: 'center' });
              } else {
                let sysLogoData = data.systemLogo;
                if (sysLogoData.startsWith('data:')) sysLogoData = sysLogoData.split(',')[1];
                doc.image(Buffer.from(sysLogoData, 'base64'), startX + contentWidth - (logoMaxWidth + 10), logoY, { fit: [logoMaxWidth, logoMaxHeight], align: 'center', valign: 'center' });
              }
          } catch (e) {
               console.error("System Logo Error", e);
          }
      }

      currentY += headerHeight + 10;

      // Note Sub-header
      doc.font('Helvetica-Oblique').fontSize(8)
         .text(`NOTE: THIS INSTALLATION CERTIFICATE IS ONLY VALID IN THE STATE OF ${data.qrCode.batch.state.name.toUpperCase()}`, 
               startX, currentY, { align: 'center', width: contentWidth });
      currentY += 15;

      // ================= MAIN INFO BLOCK =================
      const qrColWidth = 130;
      const textColWidth = contentWidth - qrColWidth;
      const rowHeight = 16;
      let infoY = currentY;

      // QR Code (Left)
      if (data.qrCodeImagePath) {
          try {
             // 120x120 QR Code
             doc.image(data.qrCodeImagePath, startX, infoY + 10, { fit: [100, 100], align: 'center' });
             doc.font('Helvetica-Oblique').fontSize(8)
                .text('(Scan To Verify)', startX, infoY + 115, { width: 100, align: 'center' });
          } catch (e) {
              console.error("QR Image Error", e);
              doc.text('QR Error', startX, infoY + 50);
          }
      } else {
           doc.text('No QR Image', startX, infoY + 50);
      }

      // Text Fields (Right)
      // Fields: COP, COP Validity, Certificate No, QR Serial, Date Gen, Gen At, Valid From, Valid Till, Vehicle No
      const validFrom = new Date(data.generatedAt).toLocaleDateString('en-GB').replace(/\//g, '-');
      const validTill = new Date(new Date(data.generatedAt).setFullYear(new Date(data.generatedAt).getFullYear() + 1)).toLocaleDateString('en-GB').replace(/\//g, '-');
      // Vehicle Number in image seems to be date?? But we use Reg No.
      const vehicleNumber = `${data.vehicleDetails.registrationRto}${data.vehicleDetails.series}`; // Or reg number logic

      const copDoc = data.qrCode.batch.oem.copDocument || '-';
      const copVal = data.qrCode.batch.oem.copValidity 
        ? new Date(data.qrCode.batch.oem.copValidity).toLocaleDateString('en-IN') 
        : '-';

      // Clean Location Text (Remove Lat/Long)
      let locationDisplay = data.locationText || '';
      if (locationDisplay.includes('|')) {
          locationDisplay = locationDisplay.split('|')[0].trim();
      }
      if (locationDisplay.startsWith('Lat:')) {
          locationDisplay = ''; 
      }

      const infoFields = [
          ['COP', copDoc], 
          ['COP VALIDITY', copVal],
          ['CERTIFICATE NUMBER', data.certNumber], // {passingRto}{value} passed as certNumber
          ['QR CODE SERIAL NUMBER', data.qrCode.serialNumber],
          ['DATE OF GENERATION', new Date(data.generatedAt).toLocaleDateString('en-IN')],
          ['GENERATED AT', locationDisplay],
          ['VALID FROM', validFrom],
          ['VALID TILL', validTill],
          ['VEHICLE NUMBER', vehicleNumber]
      ];

      infoFields.forEach((field, i) => {
          drawField(field[0], field[1], startX + qrColWidth, infoY + (i * rowHeight), textColWidth);
      });

      currentY += (infoFields.length * rowHeight) + 10;

      // ================= MATERIAL DETAILS =================
      currentY = drawGreyHeader('MATERIAL DETAILS', currentY);
      
      // Single Row: Brand | Product | Quantity
      const matY = currentY + 5;
      const colW = contentWidth / 3;
      
      // Brand
      doc.font('Helvetica').fontSize(9).text('BRAND', startX + 5, matY);
      doc.font('Helvetica-Bold').text(`: ${data.qrCode.batch.oem.name.toUpperCase()}`, startX + 50, matY);

      // Product
      doc.font('Helvetica').text('PRODUCT', startX + colW + 5, matY);
      doc.font('Helvetica-Bold').text(`: ${data.qrCode.batch.product.name.toUpperCase()}`, startX + colW + 50, matY);

      // Quantity
      let quantityText = `${data.qrCode.batch.quantity || 1}`;
      const pCode = data.qrCode.batch.product.code ? data.qrCode.batch.product.code.toUpperCase() : '';
      if (pCode === 'C3') quantityText = 'Set of 2';
      else if (pCode === 'C4') quantityText = 'Set of 2';
      else if (pCode === 'CT') quantityText = '4 (2Y,1W,1R)';
      else if (pCode === 'CTAUTO') quantityText = '4 (2Y,1W,1R)';

      doc.font('Helvetica').text('QUANTITY', startX + (colW * 2) + 5, matY);
      doc.font('Helvetica-Bold').text(`: ${quantityText.toUpperCase()}`, startX + (colW * 2) + 50, matY);
      
      currentY += 25;

      // ================= VEHICLE DETAILS =================
      currentY = drawGreyHeader('VEHICLE DETAILS', currentY);
      
      const vY = currentY + 5;
      const vRowH = 16;
      const vColW = contentWidth / 2;

      const vLeft = [
          ['OWNER NAME', data.ownerDetails.ownerName],
          ['VEHICLE MAKE', data.vehicleDetails.vehicleMake],
          ['CHASSIS NUMBER', data.vehicleDetails.chassisNo],
          ['YEAR OF MANUFACTURING', data.vehicleDetails.manufacturingYear]
      ];
      
      const vRight = [
          ['OWNER PHONE', data.ownerDetails.ownerContact],
          ['VEHICLE CATEGORY', data.vehicleDetails.vehicleCategory],
          ['ENGINE NUMBER', data.vehicleDetails.engineNo],
          ['', '']
      ];

      for (let i = 0; i < vLeft.length; i++) {
          // Left Field
          drawField(vLeft[i][0], vLeft[i][1], startX, vY + (i * vRowH), vColW);
          // Right Field
          if (vRight[i][0]) {
             drawField(vRight[i][0], vRight[i][1], startX + vColW, vY + (i * vRowH), vColW);
          }
      }
      
      currentY += (vLeft.length * vRowH) + 10;

      // ================= FITMENT PHOTOGRAPHS =================
      currentY = drawGreyHeader('FITMENT PHOTOGRAPHS', currentY);
      currentY += 10;

      // 4 Photos in a row
      const photoGap = 10;
      const photoW = (contentWidth - (photoGap * 3)) / 4;
      const photoH = 160; 

      const photos = [
          { img: data.photos.photoFrontLeft, label: 'FRONT LEFT IMAGE' },
          { img: data.photos.photoBackRight, label: 'BACK RIGHT IMAGE' },
          { img: data.photos.photoNumberPlate, label: 'NUMBER PLATE IMAGE' },
          { img: data.photos.photoRc, label: 'DOCUMENT IMAGE' }
      ];

      photos.forEach((p, i) => {
          const px = startX + (i * (photoW + photoGap));
          if (p.img) {
              try {
                 doc.image(p.img, px, currentY, { fit: [photoW, photoH], align: 'center' });
              } catch (e) {
                  doc.rect(px, currentY, photoW, photoH).stroke();
                  doc.text('Img Error', px + 5, currentY + 40);
              }
          } else {
              doc.rect(px, currentY, photoW, photoH).stroke();
              doc.text('No Image', px + 5, currentY + 40);
          }
          doc.font('Helvetica-Bold').fontSize(7)
             .text(p.label, px, currentY + photoH + 5, { width: photoW, align: 'center' });
      });

      currentY += photoH + 20;

      // ================= DEALER DETAILS =================
      currentY = drawGreyHeader('DEALER DETAILS', currentY);
      const dY = currentY + 5;
      
      // Need Dealer Info. Assuming passed in data or placeholders.
      // If not in data, use placeholders.
      const dealerName = (data.dealerName ?? 'NA'); 
      const tradeCert = (data.tradeCertificateNo ?? 'NA');
      const gstNo = (data.gstNo ?? 'NA');
      const tradeValidity = (data.tradeValidity ?? 'NA');
      const aadharNo = (data.aadharNumber ?? 'NA');
      console.log('PDF Dealer Section Values:', { dealerName, tradeCert, gstNo, tradeValidity, aadharNo });
      
      // Left Column: Dealer Name, Trade Cert, GST, Aadhar
      // Right Column: RTO Location
      
      const leftX = startX;
      const rightX = startX + vColW;
      
      let currentLeftY = dY;
      
      // Dealer Name
      drawField('DEALER NAME', dealerName, leftX, currentLeftY, vColW);
      currentLeftY += vRowH;

      // Trade Certificate (Conditional)
      if (tradeCert !== 'NA') {
          drawField('TRADE CERTIFICATE', tradeCert, leftX, currentLeftY, vColW);
          currentLeftY += vRowH;
          if (tradeValidity !== 'NA') {
              drawField('TRADE VALIDITY', tradeValidity, leftX, currentLeftY, vColW);
              currentLeftY += vRowH;
          }
      }
      
      // GST (Conditional)
      if (gstNo !== 'NA') {
          drawField('GSTIN', gstNo, leftX, currentLeftY, vColW);
          currentLeftY += vRowH;
      }
      
      // Aadhar (Conditional)
      if (aadharNo && aadharNo !== 'NA') {
           drawField('AADHAR NUMBER', aadharNo, leftX, currentLeftY, vColW);
           currentLeftY += vRowH;
      }
      
      // Right Column: RTO Location
      drawField('RTO LOCATION', data.vehicleDetails.passingRto, rightX, dY, vColW);
      
      // Update currentY based on max height used
      currentY = Math.max(currentLeftY, dY + vRowH) + 10;

      // ================= FOOTER =================
      doc.font('Helvetica-Bold').fontSize(9).text('DECLARATION:', startX, currentY);
      currentY += 10;
      doc.font('Helvetica').fontSize(8)
         .text('We hereby certify that we have supplied/installed the ARAI approved RRT as per the CMVR rule no 104/104D specified under CMVR GSR 784 (E) 291 (E).', startX, currentY, { width: contentWidth * 0.7 });

      // Dealer Stamp Box (Right)
      const stampBoxSize = 60;
      // doc.rect(startX + contentWidth - stampBoxSize - 10, currentY - 10, stampBoxSize, stampBoxSize).stroke();
      doc.font('Helvetica-Bold').text('(DEALER STAMP & SIGN)', startX + contentWidth - 150, currentY + 30, { width: 150, align: 'center' });
      // doc.rect(startX + contentWidth - 40, currentY + 20, 20, 20).stroke(); // REMOVED overlapping box

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    });
  }


}
