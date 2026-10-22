import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { SldSerialStatus } from '@prisma/client';

@Injectable()
export class SldInventoryService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private parseSerialCsv(csvText: string): { serials: string[]; duplicatesInFile: string[] } {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { serials: [], duplicatesInFile: [] };
    }

    let start = 0;
    const first = lines[0].replace(/^["']|["']$/g, '').trim().toLowerCase();
    if (first === 'serial_number' || first === 'serial' || first === 'serialnumber' || first === 'device_serial') {
      start = 1;
    }

    const seen = new Set<string>();
    const serials: string[] = [];
    const duplicatesInFile: string[] = [];

    for (let i = start; i < lines.length; i++) {
      const raw = lines[i].split(/[,;\t]/)[0].replace(/^["']|["']$/g, '').trim();
      if (!raw) continue;
      const key = raw.toUpperCase();
      if (seen.has(key)) {
        duplicatesInFile.push(raw);
        continue;
      }
      seen.add(key);
      serials.push(key); // always store UPPERCASE
    }

    return { serials, duplicatesInFile };
  }

  async uploadInventory(data: { sldOemId: string; modelId: string; csvText: string }, userId?: string) {
    const sldOemId = String(data?.sldOemId || '').trim();
    const modelId = String(data?.modelId || '').trim();
    if (!sldOemId || !modelId) {
      throw new BadRequestException('sldOemId and modelId are required');
    }

    const model = await this.prisma.sldDeviceModel.findUnique({ where: { id: modelId } });
    if (!model || model.sldOemId !== sldOemId) {
      throw new BadRequestException('Model does not belong to the selected SLD OEM');
    }

    const { serials, duplicatesInFile } = this.parseSerialCsv(data.csvText);
    if (serials.length === 0) {
      throw new BadRequestException('No serial numbers found in CSV');
    }

    const existingExact = await this.prisma.sldDeviceSerial.findMany({
      where: { sldOemId, serialNumber: { in: serials } },
      select: { serialNumber: true },
    });

    const existingSet = new Set(existingExact.map((e) => e.serialNumber.toUpperCase()));

    const toCreate = serials.filter((s) => !existingSet.has(s.toUpperCase()));
    const alreadyExists = serials.filter((s) => existingSet.has(s.toUpperCase()));

    if (toCreate.length > 0) {
      await this.prisma.sldDeviceSerial.createMany({
        data: toCreate.map((serialNumber) => ({
          sldOemId,
          modelId,
          serialNumber,
          status: SldSerialStatus.AVAILABLE,
        })),
        skipDuplicates: true,
      });
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'UPLOAD_SLD_INVENTORY',
        'SLD_INVENTORY',
        sldOemId,
        `Uploaded ${toCreate.length} serials for model ${model.code} (skipped ${alreadyExists.length} existing, ${duplicatesInFile.length} file duplicates)`,
      );
    }

    return {
      created: toCreate.length,
      alreadyExists,
      duplicatesInFile,
      invalid: [] as string[],
      totalParsed: serials.length,
    };
  }

  async listInventory(query: {
    sldOemId?: string;
    modelId?: string;
    status?: string;
    dealerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const where: any = {};

    if (query.sldOemId) where.sldOemId = query.sldOemId;
    if (query.modelId) where.modelId = query.modelId;
    if (query.dealerId) where.dealerId = query.dealerId;
    if (query.status && Object.values(SldSerialStatus).includes(query.status as SldSerialStatus)) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      where.serialNumber = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, items, statusGroups] = await Promise.all([
      this.prisma.sldDeviceSerial.count({ where }),
      this.prisma.sldDeviceSerial.findMany({
        where,
        include: {
          sldOem: { select: { id: true, code: true, name: true } },
          model: { select: { id: true, code: true, name: true } },
          dealer: { select: { id: true, name: true, phone: true } },
          certificates: {
            select: { id: true, certificateNumber: true, generatedAt: true, status: true, kind: true },
            orderBy: { generatedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ status: 'asc' }, { serialNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sldDeviceSerial.groupBy({
        by: ['status'],
        where: (() => {
          const countWhere = { ...where };
          delete countWhere.status;
          return countWhere;
        })(),
        _count: { _all: true },
      }),
    ]);

    const counts = {
      AVAILABLE: 0,
      ASSIGNED: 0,
      USED: 0,
    };
    for (const row of statusGroups) {
      if (row.status in counts) {
        counts[row.status as keyof typeof counts] = row._count._all;
      }
    }

    return {
      total,
      page,
      limit,
      items: items.map((item: any) => ({
        ...item,
        certificate: item.certificates?.[0] || null,
        certificates: undefined,
      })),
      counts,
    };
  }

  async listAvailableForAssign(sldOemId: string, modelId: string) {
    if (!sldOemId || !modelId) {
      throw new BadRequestException('sldOemId and modelId are required');
    }
    return this.prisma.sldDeviceSerial.findMany({
      where: {
        sldOemId,
        modelId,
        status: SldSerialStatus.AVAILABLE,
        dealerId: null,
      },
      orderBy: { serialNumber: 'asc' },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        createdAt: true,
      },
    });
  }

  /** ASSIGNED (unused) serials eligible to forward — optional dealer scope. */
  async listAssignedForForward(sldOemId: string, dealerId?: string) {
    const oemId = String(sldOemId || '').trim();
    if (!oemId) throw new BadRequestException('sldOemId is required');

    return this.prisma.sldDeviceSerial.findMany({
      where: {
        sldOemId: oemId,
        status: SldSerialStatus.ASSIGNED,
        dealerId: dealerId ? dealerId : { not: null },
      },
      orderBy: { serialNumber: 'asc' },
      take: 1000,
      select: {
        id: true,
        serialNumber: true,
        status: true,
        dealerId: true,
        assignedAt: true,
        model: { select: { id: true, code: true, name: true } },
        dealer: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  private async validateAssignContext(dealerId: string, sldOemId: string, modelId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { sldOems: true },
    });
    if (!dealer) throw new NotFoundException('Dealer not found');

    const authorized = dealer.sldOems.some((o) => o.id === sldOemId);
    if (!authorized) {
      throw new BadRequestException('Dealer is not authorized for this SLD OEM');
    }

    const oem = await this.prisma.sldOem.findUnique({ where: { id: sldOemId } });
    if (!oem) throw new BadRequestException('SLD OEM not found');
    if (!oem.authorizedStates.includes(dealer.stateCode)) {
      throw new BadRequestException(`SLD OEM ${oem.code} is not authorized for dealer state ${dealer.stateCode}`);
    }

    const model = await this.prisma.sldDeviceModel.findUnique({ where: { id: modelId } });
    if (!model || model.sldOemId !== sldOemId) {
      throw new BadRequestException('Model does not belong to the selected SLD OEM');
    }

    return { dealer, oem, model };
  }

  async assignManual(data: {
    dealerId: string;
    sldOemId: string;
    modelId: string;
    serialIds: string[];
  }, userId?: string) {
    const dealerId = String(data?.dealerId || '').trim();
    const sldOemId = String(data?.sldOemId || '').trim();
    const modelId = String(data?.modelId || '').trim();
    const serialIds = Array.isArray(data?.serialIds)
      ? data.serialIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!dealerId || !sldOemId || !modelId) {
      throw new BadRequestException('dealerId, sldOemId and modelId are required');
    }
    if (serialIds.length === 0) {
      throw new BadRequestException('Select at least one serial');
    }

    await this.validateAssignContext(dealerId, sldOemId, modelId);

    const rows = await this.prisma.sldDeviceSerial.findMany({
      where: { id: { in: serialIds } },
    });

    const foundIds = new Set(rows.map((r) => r.id));
    const notFound = serialIds.filter((id) => !foundIds.has(id));
    const assigned: string[] = [];
    const alreadyAssigned: string[] = [];
    const alreadyUsed: string[] = [];
    const wrongOemOrModel: string[] = [];
    const eligibleIds: string[] = [];

    for (const row of rows) {
      if (row.sldOemId !== sldOemId || row.modelId !== modelId) {
        wrongOemOrModel.push(row.serialNumber);
        continue;
      }
      if (row.status === SldSerialStatus.USED) {
        alreadyUsed.push(row.serialNumber);
        continue;
      }
      if (row.status === SldSerialStatus.ASSIGNED || row.dealerId) {
        alreadyAssigned.push(row.serialNumber);
        continue;
      }
      eligibleIds.push(row.id);
      assigned.push(row.serialNumber);
    }

    if (eligibleIds.length > 0) {
      await this.prisma.sldDeviceSerial.updateMany({
        where: { id: { in: eligibleIds }, status: SldSerialStatus.AVAILABLE },
        data: {
          status: SldSerialStatus.ASSIGNED,
          dealerId,
          assignedAt: new Date(),
        },
      });
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'ASSIGN_SLD_SERIAL',
        'SLD_INVENTORY',
        dealerId,
        `Assigned ${assigned.length} serials to dealer`,
      );
    }

    return {
      assigned,
      alreadyAssigned,
      alreadyUsed,
      notFound,
      wrongOemOrModel,
      duplicates: [] as string[],
    };
  }

  async assignCsv(data: {
    dealerId: string;
    sldOemId: string;
    modelId: string;
    csvText: string;
  }, userId?: string) {
    const dealerId = String(data?.dealerId || '').trim();
    const sldOemId = String(data?.sldOemId || '').trim();
    const modelId = String(data?.modelId || '').trim();

    if (!dealerId || !sldOemId || !modelId) {
      throw new BadRequestException('dealerId, sldOemId and modelId are required');
    }

    await this.validateAssignContext(dealerId, sldOemId, modelId);

    const { serials, duplicatesInFile } = this.parseSerialCsv(data.csvText);
    if (serials.length === 0) {
      throw new BadRequestException('No serial numbers found in CSV');
    }

    const rows = await this.prisma.sldDeviceSerial.findMany({
      where: {
        sldOemId,
        serialNumber: { in: serials },
      },
    });

    const bySerial = new Map(rows.map((r) => [r.serialNumber.toUpperCase(), r]));
    const assigned: string[] = [];
    const alreadyAssigned: string[] = [];
    const alreadyUsed: string[] = [];
    const notFound: string[] = [];
    const wrongOemOrModel: string[] = [];
    const eligibleIds: string[] = [];

    for (const serial of serials) {
      const row = bySerial.get(serial.toUpperCase());
      if (!row) {
        notFound.push(serial);
        continue;
      }
      if (row.modelId !== modelId) {
        wrongOemOrModel.push(serial);
        continue;
      }
      if (row.status === SldSerialStatus.USED) {
        alreadyUsed.push(serial);
        continue;
      }
      if (row.status === SldSerialStatus.ASSIGNED || row.dealerId) {
        alreadyAssigned.push(serial);
        continue;
      }
      eligibleIds.push(row.id);
      assigned.push(serial);
    }

    if (eligibleIds.length > 0) {
      await this.prisma.sldDeviceSerial.updateMany({
        where: { id: { in: eligibleIds }, status: SldSerialStatus.AVAILABLE },
        data: {
          status: SldSerialStatus.ASSIGNED,
          dealerId,
          assignedAt: new Date(),
        },
      });
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'ASSIGN_SLD_SERIAL',
        'SLD_INVENTORY',
        dealerId,
        `CSV assigned ${assigned.length} serials to dealer`,
      );
    }

    return {
      assigned,
      alreadyAssigned,
      alreadyUsed,
      notFound,
      wrongOemOrModel,
      duplicates: duplicatesInFile,
    };
  }

  /** Active dealers authorised for a given SLD OEM (excludes `excludeDealerId`). */
  async listForwardTargets(sldOemId: string, excludeDealerId?: string) {
    const oemId = String(sldOemId || '').trim();
    if (!oemId) throw new BadRequestException('sldOemId is required');

    const oem = await this.prisma.sldOem.findUnique({ where: { id: oemId } });
    if (!oem) throw new NotFoundException('SLD OEM not found');

    const dealers = await this.prisma.dealer.findMany({
      where: {
        status: 'ACTIVE',
        sldOems: { some: { id: oemId } },
        ...(excludeDealerId ? { id: { not: excludeDealerId } } : {}),
        stateCode: { in: oem.authorizedStates },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        stateCode: true,
        sldOems: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return dealers;
  }

  private async assertDealerHasOem(dealerId: string, sldOemId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { sldOems: true },
    });
    if (!dealer) throw new NotFoundException('Dealer not found');
    if (dealer.status !== 'ACTIVE') {
      throw new BadRequestException('Dealer account is inactive');
    }
    if (!dealer.sldOems.some((o) => o.id === sldOemId)) {
      throw new BadRequestException('Dealer is not authorized for this SLD OEM');
    }
    const oem = await this.prisma.sldOem.findUnique({ where: { id: sldOemId } });
    if (!oem) throw new BadRequestException('SLD OEM not found');
    if (!oem.authorizedStates.includes(dealer.stateCode)) {
      throw new BadRequestException(
        `SLD OEM ${oem.code} is not authorized for dealer state ${dealer.stateCode}`,
      );
    }
    return { dealer, oem };
  }

  /**
   * Forward ASSIGNED (unused) serials from one dealer to another
   * who is authorised for the same SLD OEM.
   * Admin may omit fromDealerId — source is resolved per serial (CSV / multi-dealer).
   */
  async forwardSerials(
    data: {
      toDealerId: string;
      sldOemId: string;
      serialIds?: string[];
      serialNumbers?: string[];
      csvText?: string;
    },
    fromDealerId: string | undefined,
    userId?: string,
  ) {
    const toDealerId = String(data?.toDealerId || '').trim();
    const sldOemId = String(data?.sldOemId || '').trim();
    const sourceDealerId = String(fromDealerId || '').trim();
    if (!toDealerId || !sldOemId) {
      throw new BadRequestException('toDealerId and sldOemId are required');
    }

    await this.assertDealerHasOem(toDealerId, sldOemId);

    const serialIds = Array.isArray(data?.serialIds)
      ? data.serialIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    let serialNumbers = Array.isArray(data?.serialNumbers)
      ? data.serialNumbers.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];

    if (data?.csvText?.trim()) {
      const { serials } = this.parseSerialCsv(data.csvText);
      serialNumbers = [...serialNumbers, ...serials];
    }
    serialNumbers = [...new Set(serialNumbers)];

    if (serialIds.length === 0 && serialNumbers.length === 0) {
      throw new BadRequestException('Select at least one serial to forward (or provide CSV)');
    }

    const orFilters: any[] = [];
    if (serialIds.length) orFilters.push({ id: { in: serialIds } });
    if (serialNumbers.length) orFilters.push({ serialNumber: { in: serialNumbers } });

    // Single known source dealer (dealer login, or admin with fromDealerId)
    if (sourceDealerId) {
      if (toDealerId === sourceDealerId) {
        throw new BadRequestException('Cannot forward inventory to yourself');
      }
      await this.assertDealerHasOem(sourceDealerId, sldOemId);

      const rows = await this.prisma.sldDeviceSerial.findMany({
        where: {
          sldOemId,
          dealerId: sourceDealerId,
          status: SldSerialStatus.ASSIGNED,
          OR: orFilters,
        },
      });

      const foundIds = new Set(rows.map((r) => r.id));
      const foundSerials = new Set(rows.map((r) => r.serialNumber.toUpperCase()));
      const notFound = [
        ...serialIds.filter((id) => !foundIds.has(id)),
        ...serialNumbers.filter((s) => !foundSerials.has(s)),
      ];

      const forwarded: string[] = [];
      if (rows.length > 0) {
        await this.prisma.sldDeviceSerial.updateMany({
          where: {
            id: { in: rows.map((r) => r.id) },
            dealerId: sourceDealerId,
            status: SldSerialStatus.ASSIGNED,
          },
          data: {
            dealerId: toDealerId,
            assignedAt: new Date(),
          },
        });
        forwarded.push(...rows.map((r) => r.serialNumber));
      }

      if (userId) {
        await this.auditService.logAction(
          userId,
          'FORWARD_SLD_SERIAL',
          'SLD_INVENTORY',
          toDealerId,
          `Forwarded ${forwarded.length} serial(s) from ${sourceDealerId} to ${toDealerId} (OEM ${sldOemId})`,
        );
      }

      return { forwarded, notFound, notEligible: [] as string[] };
    }

    // Admin: resolve source dealer per serial among ASSIGNED stock for this OEM
    const rows = await this.prisma.sldDeviceSerial.findMany({
      where: {
        sldOemId,
        status: SldSerialStatus.ASSIGNED,
        dealerId: { not: null },
        OR: orFilters,
      },
    });

    const foundIds = new Set(rows.map((r) => r.id));
    const foundSerials = new Set(rows.map((r) => r.serialNumber.toUpperCase()));
    const notFound = [
      ...serialIds.filter((id) => !foundIds.has(id)),
      ...serialNumbers.filter((s) => !foundSerials.has(s)),
    ];

    const byDealer = new Map<string, typeof rows>();
    const notEligible: string[] = [];
    for (const row of rows) {
      if (!row.dealerId) {
        notEligible.push(row.serialNumber);
        continue;
      }
      if (row.dealerId === toDealerId) {
        notEligible.push(row.serialNumber);
        continue;
      }
      const list = byDealer.get(row.dealerId) || [];
      list.push(row);
      byDealer.set(row.dealerId, list);
    }

    const forwarded: string[] = [];
    for (const [dealerId, group] of byDealer) {
      await this.assertDealerHasOem(dealerId, sldOemId);
      await this.prisma.sldDeviceSerial.updateMany({
        where: {
          id: { in: group.map((r) => r.id) },
          dealerId,
          status: SldSerialStatus.ASSIGNED,
        },
        data: {
          dealerId: toDealerId,
          assignedAt: new Date(),
        },
      });
      forwarded.push(...group.map((r) => r.serialNumber));
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'FORWARD_SLD_SERIAL',
        'SLD_INVENTORY',
        toDealerId,
        `Forwarded ${forwarded.length} serial(s) to ${toDealerId} (OEM ${sldOemId}, multi-source)`,
      );
    }

    return { forwarded, notFound, notEligible };
  }

  private resolveSerialSelection(data: {
    sldOemId?: string;
    serialIds?: string[];
    serialNumbers?: string[];
    csvText?: string;
  }) {
    const sldOemId = String(data?.sldOemId || '').trim();
    const serialIds = Array.isArray(data?.serialIds)
      ? data.serialIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    let serialNumbers = Array.isArray(data?.serialNumbers)
      ? data.serialNumbers.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];
    if (data?.csvText?.trim()) {
      const { serials } = this.parseSerialCsv(data.csvText);
      serialNumbers = [...serialNumbers, ...serials];
    }
    serialNumbers = [...new Set(serialNumbers)];

    if (serialIds.length === 0 && serialNumbers.length === 0) {
      throw new BadRequestException('Provide serialIds or CSV / serial numbers');
    }

    const orFilters: any[] = [];
    if (serialIds.length) orFilters.push({ id: { in: serialIds } });
    if (serialNumbers.length) orFilters.push({ serialNumber: { in: serialNumbers } });

    return { sldOemId, serialIds, serialNumbers, orFilters };
  }

  /**
   * SUPER_ADMIN: permanently remove AVAILABLE/ASSIGNED serials with no certificates
   * so they can be uploaded again under the correct model.
   */
  async bulkDeleteSerials(
    data: {
      sldOemId?: string;
      serialIds?: string[];
      serialNumbers?: string[];
      csvText?: string;
    },
    userId?: string,
  ) {
    const { sldOemId, serialIds, serialNumbers, orFilters } = this.resolveSerialSelection(data);

    const rows = await this.prisma.sldDeviceSerial.findMany({
      where: {
        ...(sldOemId ? { sldOemId } : {}),
        OR: orFilters,
      },
      include: {
        _count: { select: { certificates: true } },
      },
    });

    const foundIds = new Set(rows.map((r) => r.id));
    const foundSerials = new Set(rows.map((r) => r.serialNumber.toUpperCase()));
    const notFound = [
      ...serialIds.filter((id) => !foundIds.has(id)),
      ...serialNumbers.filter((s) => !foundSerials.has(s)),
    ];

    const deleted: string[] = [];
    const blockedUsed: string[] = [];
    const blockedWithCert: string[] = [];
    const eligibleIds: string[] = [];

    for (const row of rows) {
      if (row._count.certificates > 0 || row.status === SldSerialStatus.USED) {
        if (row.status === SldSerialStatus.USED) blockedUsed.push(row.serialNumber);
        else blockedWithCert.push(row.serialNumber);
        continue;
      }
      if (row.status !== SldSerialStatus.AVAILABLE && row.status !== SldSerialStatus.ASSIGNED) {
        blockedUsed.push(row.serialNumber);
        continue;
      }
      eligibleIds.push(row.id);
      deleted.push(row.serialNumber);
    }

    if (eligibleIds.length > 0) {
      await this.prisma.sldDeviceSerial.deleteMany({
        where: {
          id: { in: eligibleIds },
          status: { in: [SldSerialStatus.AVAILABLE, SldSerialStatus.ASSIGNED] },
        },
      });
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'DELETE_SLD_SERIALS',
        'SLD_INVENTORY',
        sldOemId || eligibleIds[0] || 'bulk',
        `Deleted ${deleted.length} serial(s); blocked used=${blockedUsed.length} cert=${blockedWithCert.length}`,
      );
    }

    return { deleted, blockedUsed, blockedWithCert, notFound };
  }

  /**
   * SUPER_ADMIN: move AVAILABLE/ASSIGNED serials (no certificates) to another model
   * under the same OEM. Dealer assignment is preserved.
   */
  async changeModel(
    data: {
      targetModelId: string;
      sldOemId?: string;
      serialIds?: string[];
      serialNumbers?: string[];
      csvText?: string;
    },
    userId?: string,
  ) {
    const targetModelId = String(data?.targetModelId || '').trim();
    if (!targetModelId) throw new BadRequestException('targetModelId is required');

    const targetModel = await this.prisma.sldDeviceModel.findUnique({
      where: { id: targetModelId },
    });
    if (!targetModel) throw new NotFoundException('Target model not found');

    const { sldOemId, serialIds, serialNumbers, orFilters } = this.resolveSerialSelection(data);
    if (sldOemId && sldOemId !== targetModel.sldOemId) {
      throw new BadRequestException('Target model belongs to a different SLD OEM');
    }

    const rows = await this.prisma.sldDeviceSerial.findMany({
      where: {
        sldOemId: targetModel.sldOemId,
        OR: orFilters,
      },
      include: {
        _count: { select: { certificates: true } },
      },
    });

    const foundIds = new Set(rows.map((r) => r.id));
    const foundSerials = new Set(rows.map((r) => r.serialNumber.toUpperCase()));
    const notFound = [
      ...serialIds.filter((id) => !foundIds.has(id)),
      ...serialNumbers.filter((s) => !foundSerials.has(s)),
    ];

    const updated: string[] = [];
    const blockedUsed: string[] = [];
    const blockedWithCert: string[] = [];
    const alreadyOnTarget: string[] = [];
    const eligibleIds: string[] = [];

    for (const row of rows) {
      if (row.modelId === targetModelId) {
        alreadyOnTarget.push(row.serialNumber);
        continue;
      }
      if (row._count.certificates > 0 || row.status === SldSerialStatus.USED) {
        if (row.status === SldSerialStatus.USED) blockedUsed.push(row.serialNumber);
        else blockedWithCert.push(row.serialNumber);
        continue;
      }
      if (row.status !== SldSerialStatus.AVAILABLE && row.status !== SldSerialStatus.ASSIGNED) {
        blockedUsed.push(row.serialNumber);
        continue;
      }
      eligibleIds.push(row.id);
      updated.push(row.serialNumber);
    }

    if (eligibleIds.length > 0) {
      await this.prisma.sldDeviceSerial.updateMany({
        where: {
          id: { in: eligibleIds },
          sldOemId: targetModel.sldOemId,
          status: { in: [SldSerialStatus.AVAILABLE, SldSerialStatus.ASSIGNED] },
        },
        data: { modelId: targetModelId },
      });
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'CHANGE_SLD_SERIAL_MODEL',
        'SLD_INVENTORY',
        targetModelId,
        `Moved ${updated.length} serial(s) to model ${targetModel.code}`,
      );
    }

    return {
      updated,
      alreadyOnTarget,
      blockedUsed,
      blockedWithCert,
      notFound,
      targetModel: { id: targetModel.id, code: targetModel.code, name: targetModel.name },
    };
  }
}
