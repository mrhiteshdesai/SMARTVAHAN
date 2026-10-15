import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { SldCertKind, SldCertStatus, SldSerialStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { S3Service } from '../s3/s3.service';
import { renderSldCertificatePdf } from './sld-certificate-pdf';
import {
  applyOemScopeToWhere,
  assertOemInScope,
  resolveSldOemScope,
} from './sld-oem-access';

@Injectable()
export class SldCertificatesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private s3Service: S3Service,
  ) {}

  private publicSiteBaseUrl(): string {
    const raw = (process.env.BASE_URL || process.env.FRONTEND_URL || 'https://smartvahan.net').trim();
    return raw.replace(/\/$/, '');
  }

  private sldVerifyUrl(certificateNumber: string): string {
    return `${this.publicSiteBaseUrl()}/verify-sld?cert=${encodeURIComponent(certificateNumber)}`;
  }

  async getDealerBootstrap(dealerId?: string, role?: string) {
    const isFullAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

    if (isFullAdmin && !dealerId) {
      const allOems = await this.prisma.sldOem.findMany({
        include: {
          models: {
            include: { _count: { select: { vehicleModels: true } } },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Admin test: AVAILABLE + ASSIGNED counts for NEW fitment testing
      const availableCounts = await this.prisma.sldDeviceSerial.groupBy({
        by: ['sldOemId', 'modelId'],
        where: {
          status: { in: [SldSerialStatus.AVAILABLE, SldSerialStatus.ASSIGNED] },
          isLegacy: false,
        },
        _count: { _all: true },
      });
      const availMap = new Map(
        availableCounts.map((r) => [`${r.sldOemId}:${r.modelId}`, r._count._all]),
      );

      const oems = allOems.map((oem) => ({
        id: oem.id,
        name: oem.name,
        code: oem.code,
        models: oem.models.map((m) => ({
          id: m.id,
          name: m.name,
          code: m.code,
          tacNumber: m.tacNumber,
          copNumber: m.copNumber,
          copValidity: m.copValidity,
          testingAgency: m.testingAgency,
          speedLimit: m.speedLimit,
          vehicleModelCount: m._count.vehicleModels,
          assignedSerialCount: availMap.get(`${oem.id}:${m.id}`) || 0,
        })),
      }));

      const totalAssigned = availableCounts.reduce((s, r) => s + r._count._all, 0);
      const renewalOems = await this.loadAllOemsForRenewal();

      return {
        dealerId: null,
        dealerName: 'System Admin',
        stateCode: null,
        hasSldAccess: true,
        unrestricted: true,
        adminTestMode: true,
        totalAssigned,
        renewalCreditBalance: null,
        renewalOems,
        oems,
      };
    }

    if (!dealerId) throw new BadRequestException('dealerId is required');

    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: {
        sldOems: {
          include: {
            models: {
              include: { _count: { select: { vehicleModels: true } } },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!dealer) throw new NotFoundException('Dealer not found');

    const assignedCounts = await this.prisma.sldDeviceSerial.groupBy({
      by: ['sldOemId', 'modelId'],
      where: { dealerId, status: SldSerialStatus.ASSIGNED },
      _count: { _all: true },
    });
    const countMap = new Map(
      assignedCounts.map((r) => [`${r.sldOemId}:${r.modelId}`, r._count._all]),
    );

    const oems = (isFullAdmin ? await this.prisma.sldOem.findMany({
      include: {
        models: {
          include: { _count: { select: { vehicleModels: true } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }) : dealer.sldOems)
      .filter((o) =>
        isFullAdmin ? true : o.authorizedStates.includes(dealer.stateCode),
      )
      .map((oem) => ({
        id: oem.id,
        name: oem.name,
        code: oem.code,
        models: oem.models.map((m) => ({
          id: m.id,
          name: m.name,
          code: m.code,
          tacNumber: m.tacNumber,
          copNumber: m.copNumber,
          copValidity: m.copValidity,
          testingAgency: m.testingAgency,
          speedLimit: m.speedLimit,
          vehicleModelCount: m._count.vehicleModels,
          assignedSerialCount: countMap.get(`${oem.id}:${m.id}`) || 0,
        })),
      }));

    const totalAssigned = assignedCounts.reduce((s, r) => s + r._count._all, 0);
    const renewalOems = await this.loadAllOemsForRenewal();

    return {
      dealerId: dealer.id,
      dealerName: dealer.name,
      stateCode: dealer.stateCode,
      hasSldAccess: oems.length > 0,
      unrestricted: isFullAdmin,
      adminTestMode: false,
      totalAssigned,
      renewalCreditBalance: dealer.sldRenewalCredits ?? 0,
      renewalOems,
      oems,
    };
  }

  private async loadAllOemsForRenewal() {
    const allOems = await this.prisma.sldOem.findMany({
      include: {
        models: {
          include: { _count: { select: { vehicleModels: true } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return allOems.map((oem) => ({
      id: oem.id,
      name: oem.name,
      code: oem.code,
      models: oem.models.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        tacNumber: m.tacNumber,
        copNumber: m.copNumber,
        copValidity: m.copValidity,
        testingAgency: m.testingAgency,
        speedLimit: m.speedLimit,
        sldType: m.sldType,
        vehicleModelCount: m._count.vehicleModels,
      })),
    }));
  }

  async listAssignedSerials(
    dealerId: string | undefined,
    sldOemId: string,
    modelId: string,
    role?: string,
  ) {
    if (!sldOemId || !modelId) {
      throw new BadRequestException('sldOemId and modelId are required');
    }
    const isFullAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

    if (isFullAdmin && !dealerId) {
      return this.prisma.sldDeviceSerial.findMany({
        where: {
          sldOemId,
          modelId,
          isLegacy: false,
          status: { in: [SldSerialStatus.AVAILABLE, SldSerialStatus.ASSIGNED] },
        },
        orderBy: [{ status: 'asc' }, { serialNumber: 'asc' }],
        select: {
          id: true,
          serialNumber: true,
          status: true,
          assignedAt: true,
          dealerId: true,
        },
      });
    }

    if (!dealerId) throw new BadRequestException('dealerId is required');
    if (!isFullAdmin) {
      await this.assertDealerOemAccess(dealerId, sldOemId);
    }

    return this.prisma.sldDeviceSerial.findMany({
      where: {
        dealerId,
        sldOemId,
        modelId,
        status: SldSerialStatus.ASSIGNED,
      },
      orderBy: { serialNumber: 'asc' },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        assignedAt: true,
        dealerId: true,
      },
    });
  }

  private async assertDealerOemAccess(dealerId: string, sldOemId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { sldOems: true },
    });
    if (!dealer) throw new NotFoundException('Dealer not found');
    const ok = dealer.sldOems.some((o) => o.id === sldOemId);
    if (!ok) throw new ForbiddenException('Not authorized for this SLD OEM');
    return dealer;
  }

  private toUploadsUrl(filePath: string | null | undefined): string | null {
    if (!filePath) return null;
    if (filePath.startsWith('http')) return filePath;
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.toLowerCase().indexOf('/uploads/');
    if (idx >= 0) return normalized.slice(idx);
    if (normalized.startsWith('uploads/')) return `/${normalized}`;
    if (normalized.startsWith('/uploads/')) return normalized;
    return `/${normalized.replace(/^\/+/, '')}`;
  }

  private saveImage(base64Data: string | undefined, dir: string, label: string): string | null {
    if (!base64Data || typeof base64Data !== 'string') return null;
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const buffer = Buffer.from(matches[2], 'base64');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileName = `${label}_${Date.now()}.jpg`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  async createCertificate(data: any, user: any) {
    const kindRaw = String(data?.kind || data?.certificateKind || 'NEW').trim().toUpperCase();
    if (kindRaw === 'RENEWAL') {
      return this.createRenewalCertificate(data, user);
    }
    return this.createNewFitmentCertificate(data, user);
  }

  private computeValidity(from: Date = new Date()) {
    const validFrom = from;
    const validTo = new Date(from);
    validTo.setFullYear(validTo.getFullYear() + 1);
    return { validFrom, validTo };
  }

  private formatDateGb(d: Date | string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB');
  }

  private async createNewFitmentCertificate(data: any, user: any) {
    const isDealer =
      user?.role === 'DEALER_USER' || user?.role === 'DEALER';
    const isFullAdmin =
      user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
    let dealerId: string | null | undefined = isDealer ? user.userId : data.dealerId || null;

    const sldOemId = String(data?.sldOemId || '').trim();
    const modelId = String(data?.modelId || '').trim();
    const deviceSerialId = String(data?.deviceSerialId || '').trim();
    const sealNumber = String(data?.sealNumber || '').trim();
    const approvedVehicleModelId = data?.approvedVehicleModelId
      ? String(data.approvedVehicleModelId).trim()
      : null;

    if (!sldOemId || !modelId || !deviceSerialId) {
      throw new BadRequestException('sldOemId, modelId and deviceSerialId are required');
    }
    if (!sealNumber) throw new BadRequestException('Seal number is required');

    const vehicleDetails = data.vehicleDetails || {};
    const ownerDetails = data.ownerDetails || {};
    const photos = data.photos || {};

    const registrationRto = String(vehicleDetails.registrationRto || '').trim().toUpperCase();
    const series = String(vehicleDetails.series || '').trim().toUpperCase();
    const vehicleNumber =
      String(vehicleDetails.vehicleNumber || `${registrationRto}${series}`).trim().toUpperCase();
    if (!vehicleNumber) throw new BadRequestException('Vehicle number is required');

    const ownerName = String(ownerDetails.ownerName || data.ownerName || '').trim();
    const ownerContact = String(ownerDetails.ownerContact || data.ownerContact || '').trim();
    if (!ownerName) throw new BadRequestException('Customer name is required');

    const serial = await this.prisma.sldDeviceSerial.findUnique({
      where: { id: deviceSerialId },
    });
    if (!serial) throw new NotFoundException('Device serial not found');
    if (serial.isLegacy) {
      throw new BadRequestException('Legacy renewal serials cannot be used for new fitment');
    }
    if (serial.sldOemId !== sldOemId || serial.modelId !== modelId) {
      throw new BadRequestException('Serial does not match OEM/model');
    }

    const model = await this.prisma.sldDeviceModel.findUnique({
      where: { id: modelId },
      include: { sldOem: true },
    });
    if (!model || model.sldOemId !== sldOemId) {
      throw new BadRequestException('Device model does not belong to selected SLD OEM');
    }

    let dealer: any = null;
    if (isFullAdmin) {
      // Admin test: AVAILABLE or ASSIGNED; dealer optional
      if (
        serial.status !== SldSerialStatus.AVAILABLE &&
        serial.status !== SldSerialStatus.ASSIGNED
      ) {
        throw new BadRequestException('Serial is not available for new fitment testing');
      }
      if (serial.status === SldSerialStatus.ASSIGNED && serial.dealerId) {
        dealerId = serial.dealerId;
        dealer = await this.prisma.dealer.findUnique({ where: { id: dealerId } });
      } else {
        dealerId = null;
        dealer = null;
      }
    } else {
      if (!dealerId) throw new BadRequestException('dealerId is required');
      dealer = await this.assertDealerOemAccess(dealerId, sldOemId);
      if (serial.status !== SldSerialStatus.ASSIGNED) {
        throw new BadRequestException('Serial is not assigned or already used');
      }
      if (serial.dealerId !== dealerId) {
        throw new BadRequestException('Serial is not assigned to this dealer or already used');
      }
    }

    if (!approvedVehicleModelId) {
      throw new BadRequestException('Approved vehicle model (with set speed) is required');
    }

    const approved = await this.prisma.sldApprovedVehicleModel.findUnique({
      where: { id: approvedVehicleModelId },
    });
    if (!approved || approved.sldDeviceModelId !== modelId) {
      throw new BadRequestException('Approved vehicle model is invalid for this device model');
    }
    if (!approved.setSpeedKmph || approved.setSpeedKmph <= 0) {
      throw new BadRequestException('Selected vehicle variant has no valid set speed');
    }
    const vehicleMake = approved.make || String(vehicleDetails.vehicleMake || '').trim();
    const vehicleModelName = approved.modelName;
    const setSpeedKmph = approved.setSpeedKmph;
    const testReportNo = approved.testReportNo || null;

    if (!vehicleMake || !vehicleModelName) {
      throw new BadRequestException('Vehicle make and model are required');
    }

    const oemCode = model.sldOem.code.toUpperCase();
    const certificateNumber = `SLD${oemCode}${vehicleNumber}`;
    const existingCertNo = await this.prisma.sldCertificate.findUnique({
      where: { certificateNumber },
    });
    if (existingCertNo) {
      throw new BadRequestException(`Certificate number ${certificateNumber} already exists`);
    }

    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'sld',
      oemCode,
      model.code,
      vehicleNumber,
    );

    const photoPaths = {
      photoPlate: this.saveImage(photos.photoPlate || photos.photoNumberPlate, uploadDir, 'Plate'),
      photoInstalled: this.saveImage(
        photos.photoInstalled || photos.photoDevice,
        uploadDir,
        'Device',
      ),
      photoSeal: this.saveImage(
        photos.photoSeal || photos.photoInstallation,
        uploadDir,
        'Installation',
      ),
      photoSerial: this.saveImage(
        photos.photoSerial || photos.photoDocument,
        uploadDir,
        'Document',
      ),
    };

    if (
      !photoPaths.photoPlate ||
      !photoPaths.photoInstalled ||
      !photoPaths.photoSeal ||
      !photoPaths.photoSerial
    ) {
      throw new BadRequestException(
        'All 4 photos are required: Number Plate, Device, Installation, Document',
      );
    }

    const generatedAt = new Date();
    const { validFrom, validTo } = this.computeValidity(generatedAt);

    const pdfFileName = `${certificateNumber}.pdf`;
    const pdfDiskPath = path.join(uploadDir, pdfFileName);
    const pdfPath = pdfDiskPath.replace(/\\/g, '/');

    const certPayload = {
      certificateNumber,
      kind: 'NEW',
      vehicleNumber,
      ownerName,
      ownerContact,
      vehicleMake,
      vehicleModelName,
      chassisNumber: String(vehicleDetails.chassisNumber || vehicleDetails.chassisNo || '').trim(),
      engineNumber: String(vehicleDetails.engineNumber || vehicleDetails.engineNo || '').trim(),
      manufacturingYear: String(vehicleDetails.manufacturingYear || '').trim(),
      passingRto: String(vehicleDetails.passingRto || '').trim().toUpperCase(),
      registrationRto,
      series,
      sealNumber,
      locationText: String(data.locationText || '').trim(),
      ...this.dealerPdfFields(dealer),
      companyName: model.sldOem.name,
      deviceModelName: model.name,
      deviceModelCode: model.code,
      deviceSerialNumber: serial.serialNumber,
      tacNumber: model.tacNumber || '',
      copNumber: model.copNumber || '',
      testingAgency: model.testingAgency || '',
      speedLimit: String(setSpeedKmph),
      testReportNo: testReportNo || '',
      verifyUrl: this.sldVerifyUrl(certificateNumber),
      generatedAt,
      validFrom,
      validTo,
      photos: photoPaths,
    };

    await this.generatePdf(pdfDiskPath, certPayload);

    let finalPdfPath = this.toUploadsUrl(pdfPath)!;
    try {
      const uploaded = await this.s3Service.uploadFile(
        pdfDiskPath,
        `sld/certificates/${oemCode}/${model.code}/${pdfFileName}`,
        'application/pdf',
      );
      if (uploaded) finalPdfPath = uploaded;
    } catch {
      // keep local uploads URL
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const whereSerial: any = {
        id: deviceSerialId,
        isLegacy: false,
      };
      if (isFullAdmin) {
        whereSerial.status = { in: [SldSerialStatus.AVAILABLE, SldSerialStatus.ASSIGNED] };
      } else {
        whereSerial.status = SldSerialStatus.ASSIGNED;
        whereSerial.dealerId = dealerId;
      }

      const updated = await tx.sldDeviceSerial.updateMany({
        where: whereSerial,
        data: {
          status: SldSerialStatus.USED,
          usedAt: new Date(),
          ...(dealerId ? { dealerId } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Serial was already used or is no longer available');
      }

      return tx.sldCertificate.create({
        data: {
          certificateNumber,
          kind: SldCertKind.NEW,
          deviceSerialId,
          dealerId: dealerId || null,
          sldOemId,
          modelId,
          status: SldCertStatus.PENDING,
          vehicleMake,
          vehicleCategory: vehicleModelName,
          fuelType: vehicleDetails.fuelType ? String(vehicleDetails.fuelType) : null,
          passingRto: certPayload.passingRto || null,
          registrationRto: registrationRto || null,
          series: series || null,
          manufacturingYear: certPayload.manufacturingYear || null,
          chassisNumber: certPayload.chassisNumber || null,
          engineNumber: certPayload.engineNumber || null,
          ownerName,
          ownerContact: ownerContact || null,
          vehicleNumber,
          photoInstalled: this.toUploadsUrl(photoPaths.photoInstalled!)!,
          photoSeal: this.toUploadsUrl(photoPaths.photoSeal!)!,
          photoSerial: this.toUploadsUrl(photoPaths.photoSerial!)!,
          photoPlate: this.toUploadsUrl(photoPaths.photoPlate!)!,
          sealNumber,
          setSpeedKmph,
          testReportNo,
          validFrom,
          validTo,
          renewalCreditCharged: false,
          smartvahanPdfPath: finalPdfPath,
          locationText: certPayload.locationText || null,
          generatedAt,
        },
      });
    });

    await this.auditService.logAction(
      user?.userId || dealerId || 'admin',
      'CREATE_SLD_CERT',
      'SLD_CERTIFICATE',
      created.id,
      `Created SLD certificate ${certificateNumber}`,
    );

    return {
      success: true,
      message: 'SLD certificate generated',
      certificate: created,
      pdfUrl: this.toUploadsUrl(finalPdfPath),
      certificateNumber,
    };
  }

  /**
   * Renewal: typed serial (USED inventory or legacy create), dealer debit 1 credit;
   * admin may renew with dealerId null and no credit debit.
   */
  async createRenewalCertificate(data: any, user: any) {
    const isDealer = user?.role === 'DEALER_USER' || user?.role === 'DEALER';
    const isFullAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
    const dealerId: string | null = isDealer
      ? user.userId
      : data.dealerId
        ? String(data.dealerId).trim()
        : null;

    const sldOemId = String(data?.sldOemId || '').trim();
    const modelId = String(data?.modelId || '').trim();
    const serialNumber = String(data?.serialNumber || '').trim().toUpperCase();
    const sealNumber = String(data?.sealNumber || '').trim();
    const approvedVehicleModelId = data?.approvedVehicleModelId
      ? String(data.approvedVehicleModelId).trim()
      : null;

    if (!sldOemId || !modelId || !serialNumber) {
      throw new BadRequestException('sldOemId, modelId and serialNumber are required for renewal');
    }
    if (!sealNumber) throw new BadRequestException('Seal number is required');
    if (!approvedVehicleModelId) {
      throw new BadRequestException('Approved vehicle model (with set speed) is required');
    }

    if (isDealer && !dealerId) {
      throw new BadRequestException('dealerId is required');
    }
    if (!isDealer && !isFullAdmin) {
      throw new ForbiddenException('Not authorized to create renewal certificates');
    }

    let dealer: { id: string; name: string; sldRenewalCredits: number } | null = null;
    if (dealerId) {
      dealer = await this.prisma.dealer.findUnique({ where: { id: dealerId } });
      if (!dealer) throw new NotFoundException('Dealer not found');
    }

    // Dealer renewals always debit; admin never debits (even with optional dealerId)
    const shouldDebitCredit = isDealer;
    if (shouldDebitCredit) {
      if ((dealer?.sldRenewalCredits || 0) < 1) {
        throw new BadRequestException('No SLD renewal credits remaining. Contact platform owner.');
      }
    }

    const model = await this.prisma.sldDeviceModel.findUnique({
      where: { id: modelId },
      include: { sldOem: true },
    });
    if (!model || model.sldOemId !== sldOemId) {
      throw new BadRequestException('Device model does not belong to selected SLD OEM');
    }

    const approved = await this.prisma.sldApprovedVehicleModel.findUnique({
      where: { id: approvedVehicleModelId },
    });
    if (!approved || approved.sldDeviceModelId !== modelId) {
      throw new BadRequestException('Approved vehicle model is invalid for this device model');
    }
    if (!approved.setSpeedKmph || approved.setSpeedKmph <= 0) {
      throw new BadRequestException('Selected vehicle variant has no valid set speed');
    }

    const vehicleDetails = data.vehicleDetails || {};
    const ownerDetails = data.ownerDetails || {};
    const photos = data.photos || {};

    const registrationRto = String(vehicleDetails.registrationRto || '').trim().toUpperCase();
    const series = String(vehicleDetails.series || '').trim().toUpperCase();
    const vehicleNumber =
      String(vehicleDetails.vehicleNumber || `${registrationRto}${series}`).trim().toUpperCase();
    if (!vehicleNumber) throw new BadRequestException('Vehicle number is required');

    const ownerName = String(ownerDetails.ownerName || data.ownerName || '').trim();
    const ownerContact = String(ownerDetails.ownerContact || data.ownerContact || '').trim();
    if (!ownerName) throw new BadRequestException('Customer name is required');

    const vehicleMake = approved.make || String(vehicleDetails.vehicleMake || '').trim();
    const vehicleModelName = approved.modelName;
    const setSpeedKmph = approved.setSpeedKmph;
    const testReportNo = approved.testReportNo || null;
    if (!vehicleMake || !vehicleModelName) {
      throw new BadRequestException('Vehicle make and model are required');
    }

    let serial = await this.prisma.sldDeviceSerial.findUnique({
      where: { sldOemId_serialNumber: { sldOemId, serialNumber } },
    });
    if (serial) {
      if (serial.modelId !== modelId) {
        throw new BadRequestException(
          'Serial already exists under a different device model for this OEM',
        );
      }
      if (
        serial.status === SldSerialStatus.AVAILABLE ||
        serial.status === SldSerialStatus.ASSIGNED
      ) {
        throw new BadRequestException(
          'Cannot renew an unfitted serial; device must be USED / fitted first',
        );
      }
      // USED: OK — do not change dealerId / status on renewal
    } else {
      serial = await this.prisma.sldDeviceSerial.create({
        data: {
          sldOemId,
          modelId,
          serialNumber,
          status: SldSerialStatus.USED,
          isLegacy: true,
          dealerId: dealerId || null,
          usedAt: new Date(),
        },
      });
    }

    const oemCode = model.sldOem.code.toUpperCase();
    const suffix = Date.now().toString(36).toUpperCase();
    const certificateNumber = `SLD${oemCode}${vehicleNumber}-R${suffix}`;

    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'sld',
      oemCode,
      model.code,
      vehicleNumber,
      'renewal',
      suffix,
    );

    const photoPaths = {
      photoPlate: this.saveImage(photos.photoPlate || photos.photoNumberPlate, uploadDir, 'Plate'),
      photoInstalled: this.saveImage(
        photos.photoInstalled || photos.photoDevice,
        uploadDir,
        'Device',
      ),
      photoSeal: this.saveImage(
        photos.photoSeal || photos.photoInstallation,
        uploadDir,
        'Installation',
      ),
      photoSerial: this.saveImage(
        photos.photoSerial || photos.photoDocument,
        uploadDir,
        'Document',
      ),
    };

    if (
      !photoPaths.photoPlate ||
      !photoPaths.photoInstalled ||
      !photoPaths.photoSeal ||
      !photoPaths.photoSerial
    ) {
      throw new BadRequestException(
        'All 4 photos are required: Number Plate, Device, Installation, Document',
      );
    }

    const generatedAt = new Date();
    const { validFrom, validTo } = this.computeValidity(generatedAt);

    const pdfFileName = `${certificateNumber}.pdf`;
    const pdfDiskPath = path.join(uploadDir, pdfFileName);
    const pdfPath = pdfDiskPath.replace(/\\/g, '/');

    const certPayload = {
      certificateNumber,
      kind: 'RENEWAL',
      vehicleNumber,
      ownerName,
      ownerContact,
      vehicleMake,
      vehicleModelName,
      chassisNumber: String(vehicleDetails.chassisNumber || vehicleDetails.chassisNo || '').trim(),
      engineNumber: String(vehicleDetails.engineNumber || vehicleDetails.engineNo || '').trim(),
      manufacturingYear: String(vehicleDetails.manufacturingYear || '').trim(),
      passingRto: String(vehicleDetails.passingRto || '').trim().toUpperCase(),
      registrationRto,
      series,
      sealNumber,
      locationText: String(data.locationText || '').trim(),
      ...this.dealerPdfFields(dealer),
      companyName: model.sldOem.name,
      deviceModelName: model.name,
      deviceModelCode: model.code,
      deviceSerialNumber: serial.serialNumber,
      tacNumber: model.tacNumber || '',
      copNumber: model.copNumber || '',
      testingAgency: model.testingAgency || '',
      speedLimit: String(setSpeedKmph),
      testReportNo: testReportNo || '',
      verifyUrl: this.sldVerifyUrl(certificateNumber),
      generatedAt,
      validFrom,
      validTo,
      photos: photoPaths,
    };

    await this.generatePdf(pdfDiskPath, certPayload);

    let finalPdfPath = this.toUploadsUrl(pdfPath)!;
    try {
      const uploaded = await this.s3Service.uploadFile(
        pdfDiskPath,
        `sld/certificates/${oemCode}/${model.code}/${pdfFileName}`,
        'application/pdf',
      );
      if (uploaded) finalPdfPath = uploaded;
    } catch {
      // keep local
    }

    const renewalCreditCharged = shouldDebitCredit;

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldDebitCredit && dealerId) {
        const debit = await tx.dealer.updateMany({
          where: { id: dealerId, sldRenewalCredits: { gte: 1 } },
          data: { sldRenewalCredits: { decrement: 1 } },
        });
        if (debit.count !== 1) {
          throw new BadRequestException('No SLD renewal credits remaining');
        }
        const updatedDealer = await tx.dealer.findUnique({ where: { id: dealerId } });
        await tx.sldRenewalCreditLog.create({
          data: {
            dealerId,
            delta: -1,
            balanceAfter: updatedDealer?.sldRenewalCredits ?? 0,
            note: `Renewal cert ${certificateNumber}`,
            createdById: user?.userId || dealerId,
          },
        });
      }

      // Existing USED serial: leave status/dealerId unchanged (no ownership steal).
      // Newly created legacy serial already USED.

      return tx.sldCertificate.create({
        data: {
          certificateNumber,
          kind: SldCertKind.RENEWAL,
          deviceSerialId: serial.id,
          dealerId: dealerId || null,
          sldOemId,
          modelId,
          status: SldCertStatus.PENDING,
          vehicleMake,
          vehicleCategory: vehicleModelName,
          fuelType: vehicleDetails.fuelType ? String(vehicleDetails.fuelType) : null,
          passingRto: certPayload.passingRto || null,
          registrationRto: registrationRto || null,
          series: series || null,
          manufacturingYear: certPayload.manufacturingYear || null,
          chassisNumber: certPayload.chassisNumber || null,
          engineNumber: certPayload.engineNumber || null,
          ownerName,
          ownerContact: ownerContact || null,
          vehicleNumber,
          photoInstalled: this.toUploadsUrl(photoPaths.photoInstalled!)!,
          photoSeal: this.toUploadsUrl(photoPaths.photoSeal!)!,
          photoSerial: this.toUploadsUrl(photoPaths.photoSerial!)!,
          photoPlate: this.toUploadsUrl(photoPaths.photoPlate!)!,
          sealNumber,
          setSpeedKmph,
          testReportNo,
          validFrom,
          validTo,
          renewalCreditCharged,
          smartvahanPdfPath: finalPdfPath,
          locationText: certPayload.locationText || null,
          generatedAt,
        },
      });
    });

    let renewalCreditsRemaining: number | null = null;
    if (shouldDebitCredit && dealerId) {
      const balanceAfter = await this.prisma.dealer.findUnique({
        where: { id: dealerId },
        select: { sldRenewalCredits: true },
      });
      renewalCreditsRemaining = balanceAfter?.sldRenewalCredits ?? 0;
    }

    await this.auditService.logAction(
      user?.userId || dealerId || 'admin',
      'CREATE_SLD_RENEWAL_CERT',
      'SLD_CERTIFICATE',
      created.id,
      `Created SLD renewal certificate ${certificateNumber}`,
    );

    return {
      success: true,
      message: 'SLD renewal certificate generated',
      kind: 'RENEWAL',
      certificate: created,
      pdfUrl: this.toUploadsUrl(finalPdfPath),
      certificateNumber,
      renewalCreditsRemaining,
    };
  }

  private dealerPdfFields(dealer: any | null | undefined) {
    const tradeValidity =
      dealer?.tradeValidity != null
        ? new Date(dealer.tradeValidity).toLocaleDateString('en-GB').replace(/\//g, '-')
        : 'NA';
    return {
      dealerName: dealer?.name || 'Admin (test)',
      tradeCertificateNo: dealer?.tradeCertificateNo || 'NA',
      gstNo: dealer?.gstNo || 'NA',
      aadharNumber: dealer?.aadharNumber || null,
      tradeValidity,
    };
  }

  private async generatePdf(outputPath: string, data: any) {
    await renderSldCertificatePdf(outputPath, data);
  }

  private resolveDiskPath(urlPath: string | null | undefined): string | null {
    if (!urlPath) return null;
    if (urlPath.startsWith('http')) {
      const idx = urlPath.toLowerCase().indexOf('/uploads/');
      if (idx < 0) return null;
      const rel = urlPath.slice(idx + 1);
      return path.join(process.cwd(), rel.replace(/\//g, path.sep));
    }
    const rel = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
    return path.join(process.cwd(), rel.replace(/\//g, path.sep));
  }

  private deleteLocalFile(urlPath: string | null | undefined) {
    const diskPath = this.resolveDiskPath(urlPath);
    if (!diskPath) return;
    try {
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    } catch {
      // non-blocking
    }
  }

  private mapCertificateRow(c: any) {
    return {
      id: c.id,
      certificateNumber: c.certificateNumber,
      kind: c.kind || 'NEW',
      vehicleNumber: c.vehicleNumber,
      status: c.status,
      generatedAt: c.generatedAt,
      validFrom: c.validFrom ?? null,
      validTo: c.validTo ?? null,
      renewalCreditCharged: c.renewalCreditCharged ?? false,
      sealNumber: c.sealNumber,
      ownerName: c.ownerName,
      setSpeedKmph: c.setSpeedKmph,
      oem: c.sldOem,
      model: c.model,
      dealer: c.dealer
        ? {
            id: c.dealer.id,
            name: c.dealer.name,
            phone: c.dealer.phone,
            stateCode: c.dealer.stateCode,
          }
        : { name: 'Admin (test)' },
      serialNumber: c.deviceSerial?.serialNumber,
      smartvahanPdfPath: this.toUploadsUrl(c.smartvahanPdfPath),
      vahanPdfPath: this.toUploadsUrl(c.vahanPdfPath),
      pdfUrl: this.toUploadsUrl(c.smartvahanPdfPath),
      vahanUploadedAt: c.vahanUploadedAt,
    };
  }

  async listDealerHistory(
    dealerId: string | undefined,
    from?: string,
    to?: string,
    isFullAdmin = false,
  ) {
    const where: any = {};
    if (dealerId) {
      where.dealerId = dealerId;
    } else if (!isFullAdmin) {
      throw new BadRequestException('dealerId is required');
    }
    if (from || to) {
      where.generatedAt = {};
      if (from) where.generatedAt.gte = new Date(from);
      if (to) where.generatedAt.lte = new Date(`${to}T23:59:59.999`);
    }
    const items = await this.prisma.sldCertificate.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      include: {
        sldOem: { select: { code: true, name: true } },
        model: { select: { code: true, name: true } },
        deviceSerial: { select: { serialNumber: true } },
      },
      take: 500,
    });
    return items.map((c) => this.mapCertificateRow(c));
  }

  async listAdminCertificates(
    filters: {
      status?: SldCertStatus;
      kind?: SldCertKind;
      sldOemId?: string;
      dealerId?: string;
      stateCode?: string;
      search?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    user?: { userId?: string; role?: string },
  ) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.kind) where.kind = filters.kind;
    if (filters.sldOemId) where.sldOemId = filters.sldOemId;
    if (filters.dealerId) where.dealerId = filters.dealerId;
    if (filters.stateCode) where.dealer = { stateCode: filters.stateCode };
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { certificateNumber: { contains: q, mode: 'insensitive' } },
        { vehicleNumber: { contains: q, mode: 'insensitive' } },
        { ownerName: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (filters.from || filters.to) {
      where.generatedAt = {};
      if (filters.from) where.generatedAt.gte = new Date(filters.from);
      if (filters.to) where.generatedAt.lte = new Date(`${filters.to}T23:59:59.999`);
    }

    if (user) {
      const scope = await resolveSldOemScope(this.prisma, user);
      applyOemScopeToWhere(where, scope);
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.sldCertificate.count({ where }),
      this.prisma.sldCertificate.findMany({
        where,
        orderBy: { generatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sldOem: { select: { id: true, code: true, name: true } },
          model: { select: { id: true, code: true, name: true } },
          deviceSerial: { select: { id: true, serialNumber: true } },
          dealer: { select: { id: true, name: true, phone: true, stateCode: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      items: items.map((c) => this.mapCertificateRow(c)),
    };
  }

  async uploadVahanPdf(
    certId: string,
    pdfBase64: string,
    userId: string,
    user?: { userId?: string; role?: string },
  ) {
    if (!pdfBase64?.trim()) throw new BadRequestException('PDF data is required');
    const cert = await this.prisma.sldCertificate.findUnique({
      where: { id: certId },
      include: { sldOem: true },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    if (user) {
      const scope = await resolveSldOemScope(this.prisma, user);
      assertOemInScope(scope, cert.sldOemId);
    }

    const matches = pdfBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const buffer = matches
      ? Buffer.from(matches[2], 'base64')
      : Buffer.from(pdfBase64, 'base64');
    if (!buffer.length) throw new BadRequestException('Invalid PDF data');

    const oemCode = cert.sldOem.code.toUpperCase();
    const dir = path.join(process.cwd(), 'uploads', 'sld', 'vahan', oemCode);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileName = `${cert.certificateNumber}.pdf`;
    const diskPath = path.join(dir, fileName);
    fs.writeFileSync(diskPath, buffer);

    let finalPath = this.toUploadsUrl(diskPath.replace(/\\/g, '/'))!;
    try {
      const uploaded = await this.s3Service.uploadFile(
        diskPath,
        `sld/vahan/${oemCode}/${fileName}`,
        'application/pdf',
      );
      if (uploaded) finalPath = uploaded;
    } catch {
      // keep local path
    }

    if (cert.vahanPdfPath) this.deleteLocalFile(cert.vahanPdfPath);

    const updated = await this.prisma.sldCertificate.update({
      where: { id: certId },
      data: {
        vahanPdfPath: finalPath,
        vahanUploadedAt: new Date(),
        vahanUploadedBy: userId,
        status: SldCertStatus.COMPLETED,
      },
      include: {
        sldOem: { select: { code: true, name: true } },
        model: { select: { code: true, name: true } },
        deviceSerial: { select: { serialNumber: true } },
        dealer: { select: { id: true, name: true, phone: true, stateCode: true } },
      },
    });

    await this.auditService.logAction(
      userId,
      'UPLOAD_SLD_VAHAN',
      'SLD_CERTIFICATE',
      certId,
      `Uploaded Vahan PDF for ${cert.certificateNumber}`,
    );

    return { success: true, certificate: this.mapCertificateRow(updated) };
  }

  async reinstateCertificate(
    certId: string,
    userId: string,
    user?: { userId?: string; role?: string },
  ) {
    const cert = await this.prisma.sldCertificate.findUnique({
      where: { id: certId },
      include: { deviceSerial: true },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    if (user) {
      const scope = await resolveSldOemScope(this.prisma, user);
      assertOemInScope(scope, cert.sldOemId);
    }

    const serialId = cert.deviceSerialId;
    const otherCertCount = await this.prisma.sldCertificate.count({
      where: {
        deviceSerialId: serialId,
        id: { not: certId },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.sldCertificate.delete({ where: { id: certId } });

      if (cert.renewalCreditCharged && cert.dealerId) {
        const updatedDealer = await tx.dealer.update({
          where: { id: cert.dealerId },
          data: { sldRenewalCredits: { increment: 1 } },
        });
        await tx.sldRenewalCreditLog.create({
          data: {
            dealerId: cert.dealerId,
            delta: 1,
            balanceAfter: updatedDealer.sldRenewalCredits,
            note: `Refund reinstate ${cert.certificateNumber}`,
            createdById: userId,
          },
        });
      }

      // Serial status only when no other certificates remain on that serial
      if (otherCertCount === 0) {
        const serial = cert.deviceSerial;
        if (serial?.isLegacy) {
          // Prefer leave USED — do not put legacy into inventory / ASSIGNED
          await tx.sldDeviceSerial.update({
            where: { id: serialId },
            data: { status: SldSerialStatus.USED },
          });
        } else {
          // NEW / inventory serial
          if (cert.dealerId == null) {
            await tx.sldDeviceSerial.update({
              where: { id: serialId },
              data: {
                status: SldSerialStatus.AVAILABLE,
                dealerId: null,
                usedAt: null,
              },
            });
          } else {
            await tx.sldDeviceSerial.update({
              where: { id: serialId },
              data: {
                status: SldSerialStatus.ASSIGNED,
                dealerId: cert.dealerId || serial?.dealerId || null,
                usedAt: null,
              },
            });
          }
        }
      }
      // else: other certs remain — do not change serial status
    });

    [
      cert.smartvahanPdfPath,
      cert.vahanPdfPath,
      cert.photoInstalled,
      cert.photoSeal,
      cert.photoSerial,
      cert.photoPlate,
    ].forEach((p) => this.deleteLocalFile(p));

    await this.auditService.logAction(
      userId,
      'REINSTATE_SLD_CERT',
      'SLD_CERTIFICATE',
      certId,
      `Reinstated SLD certificate ${cert.certificateNumber}`,
    );

    const message =
      otherCertCount === 0
        ? cert.deviceSerial?.isLegacy
          ? `Certificate ${cert.certificateNumber} reinstated. Legacy serial left USED.`
          : cert.dealerId == null
            ? `Certificate ${cert.certificateNumber} reinstated. Serial is AVAILABLE.`
            : `Certificate ${cert.certificateNumber} reinstated. Serial is ASSIGNED to dealer.`
        : `Certificate ${cert.certificateNumber} reinstated. Serial unchanged (other certificates remain).`;

    return {
      success: true,
      message,
      certificateNumber: cert.certificateNumber,
    };
  }

  async reinstateBulk(
    csvText: string,
    userId: string,
    user?: { userId?: string; role?: string },
  ) {
    const lines = (csvText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const results: Array<{ line: string; success: boolean; message: string }> = [];

    for (const line of lines) {
      const certNo = line.split(',')[0].trim().toUpperCase();
      if (!certNo) {
        results.push({ line, success: false, message: 'Empty line' });
        continue;
      }
      try {
        const cert = await this.prisma.sldCertificate.findUnique({
          where: { certificateNumber: certNo },
        });
        if (!cert) {
          results.push({ line, success: false, message: 'Certificate not found' });
          continue;
        }
        await this.reinstateCertificate(cert.id, userId, user);
        results.push({ line, success: true, message: 'Reinstated' });
      } catch (e: any) {
        results.push({ line, success: false, message: e?.message || 'Failed' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return {
      success: true,
      total: results.length,
      successCount,
      failedCount: results.length - successCount,
      results,
    };
  }

  async publicVerify(certificateNumber: string) {
    const certNo = String(certificateNumber || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    if (!certNo) throw new BadRequestException('certificateNumber is required');
    if (!certNo.startsWith('SLD')) {
      throw new BadRequestException('Invalid SLD certificate number format');
    }

    const cert = await this.prisma.sldCertificate.findUnique({
      where: { certificateNumber: certNo },
      include: {
        dealer: true,
        sldOem: { select: { code: true, name: true } },
        model: {
          select: {
            code: true,
            name: true,
            tacNumber: true,
            copNumber: true,
            testingAgency: true,
            speedLimit: true,
            sldType: true,
          },
        },
        deviceSerial: { select: { serialNumber: true } },
      },
    });

    if (!cert) {
      return { success: true, status: 'NOT_FOUND', message: 'Certificate not found' };
    }

    const dealer = cert.dealer;
    const dealerVerification = dealer?.tradeCertificateNo
      ? `Trade Certificate: ${dealer.tradeCertificateNo}`
      : dealer?.gstNo
        ? `GST: ${dealer.gstNo}`
        : dealer?.aadharNumber
          ? `Aadhar: ${dealer.aadharNumber}`
          : null;

    return {
      success: true,
      status: cert.status === SldCertStatus.COMPLETED ? 'COMPLETED' : 'PENDING',
      data: {
        certificateNumber: cert.certificateNumber,
        kind: cert.kind || 'NEW',
        validFrom: cert.validFrom ?? null,
        validTo: cert.validTo ?? null,
        vehicleMake: cert.vehicleMake,
        vehicleCategory: cert.vehicleCategory,
        fuelType: cert.fuelType,
        passingRto: cert.passingRto,
        registrationRto: cert.registrationRto,
        series: cert.series,
        manufacturingYear: cert.manufacturingYear,
        chassisNumber: cert.chassisNumber,
        engineNumber: cert.engineNumber,
        ownerName: cert.ownerName,
        ownerContact: cert.ownerContact,
        vehicleNumber: cert.vehicleNumber,
        sealNumber: cert.sealNumber,
        setSpeedKmph: cert.setSpeedKmph,
        testReportNo: cert.testReportNo,
        generatedAt: cert.generatedAt,
        locationText: cert.locationText,
        photoInstalled: this.toUploadsUrl(cert.photoInstalled),
        photoSeal: this.toUploadsUrl(cert.photoSeal),
        photoSerial: this.toUploadsUrl(cert.photoSerial),
        photoPlate: this.toUploadsUrl(cert.photoPlate),
        smartvahanPdfUrl: this.toUploadsUrl(cert.smartvahanPdfPath),
        vahanPdfUrl: this.toUploadsUrl(cert.vahanPdfPath),
        sldOem: cert.sldOem,
        deviceModel: {
          ...cert.model,
          speedLimit: cert.setSpeedKmph != null ? String(cert.setSpeedKmph) : cert.model.speedLimit,
        },
        deviceSerialNumber: cert.deviceSerial.serialNumber,
        dealerName: dealer?.name ?? null,
        dealerPhone: dealer?.phone ?? null,
        dealerVerification,
      },
    };
  }

  async lookupPriorCertificate(sldOemId: string, serialNumber: string) {
    const oemId = String(sldOemId || '').trim();
    const serial = String(serialNumber || '').trim().toUpperCase();
    if (!oemId || !serial) {
      throw new BadRequestException('sldOemId and serialNumber are required');
    }

    const deviceSerial = await this.prisma.sldDeviceSerial.findUnique({
      where: { sldOemId_serialNumber: { sldOemId: oemId, serialNumber: serial } },
    });
    if (!deviceSerial) {
      return { found: false };
    }

    const prior = await this.prisma.sldCertificate.findFirst({
      where: { deviceSerialId: deviceSerial.id },
      orderBy: { generatedAt: 'desc' },
    });
    if (!prior) {
      return { found: false, deviceSerialId: deviceSerial.id, serialNumber: serial };
    }

    return {
      found: true,
      deviceSerialId: deviceSerial.id,
      serialNumber: serial,
      modelId: prior.modelId,
      certificateNumber: prior.certificateNumber,
      kind: prior.kind,
      vehicleNumber: prior.vehicleNumber,
      registrationRto: prior.registrationRto,
      series: prior.series,
      chassisNumber: prior.chassisNumber,
      engineNumber: prior.engineNumber,
      manufacturingYear: prior.manufacturingYear,
      passingRto: prior.passingRto,
      ownerName: prior.ownerName,
      ownerContact: prior.ownerContact,
      vehicleMake: prior.vehicleMake,
      vehicleCategory: prior.vehicleCategory,
      sealNumber: prior.sealNumber,
      setSpeedKmph: prior.setSpeedKmph,
      testReportNo: prior.testReportNo,
      fuelType: prior.fuelType,
    };
  }
}
