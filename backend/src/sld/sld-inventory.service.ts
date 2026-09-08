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
      serials.push(raw);
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
          certificate: { select: { id: true, certificateNumber: true, generatedAt: true, status: true } },
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

    return { total, page, limit, items, counts };
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
}
