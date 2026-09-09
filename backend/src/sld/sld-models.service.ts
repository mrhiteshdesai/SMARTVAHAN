import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

export type VariantListRow = {
  vehicleMake?: string;
  vehicleModel?: string;
  sldModelName?: string;
  sldType?: string;
  tacOrCop?: string;
  testingAgency?: string;
  testReportNo?: string;
  setSpeed?: string | number;
};

function normalizeSldType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const u = String(raw).trim().toUpperCase();
  if (u.includes('CABLE')) return 'CABLE';
  if (u.includes('FUEL')) return 'FUEL';
  return String(raw).trim() || null;
}

/** ARAI issues COP; ICAT issues TAC. Single Excel column mapped by agency. */
export function mapApprovalByAgency(
  agency: string | null | undefined,
  approvalNumber: string | null | undefined,
): { tacNumber: string | null; copNumber: string | null; approvalKind: 'TAC' | 'COP' | 'UNKNOWN' } {
  const num = approvalNumber ? String(approvalNumber).trim() : null;
  const a = (agency || '').toUpperCase();
  if (a.includes('ARAI')) {
    return { tacNumber: null, copNumber: num, approvalKind: 'COP' };
  }
  if (a.includes('ICAT')) {
    return { tacNumber: num, copNumber: null, approvalKind: 'TAC' };
  }
  // Fallback: keep number in tacNumber field for display
  return { tacNumber: num, copNumber: null, approvalKind: 'UNKNOWN' };
}

export function parseSetSpeeds(raw: string | number | null | undefined): number[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (typeof raw === 'number' && Number.isFinite(raw)) return [Math.round(raw)];
  const parts = String(raw)
    .split(/[,;/|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const speeds: number[] = [];
  for (const p of parts) {
    const m = p.match(/(\d+)/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) speeds.push(n);
  }
  return [...new Set(speeds)];
}

function modelCodeFromName(name: string): string {
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

@Injectable()
export class SldModelsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private parseModelPayload(data: any) {
    const payload: any = {};
    if (data.name !== undefined) payload.name = String(data.name).trim();
    if (data.code !== undefined) payload.code = String(data.code).trim().toUpperCase();
    if (data.sldType !== undefined) payload.sldType = normalizeSldType(data.sldType);
    if (data.tacNumber !== undefined) payload.tacNumber = data.tacNumber ? String(data.tacNumber).trim() : null;
    if (data.copNumber !== undefined) payload.copNumber = data.copNumber ? String(data.copNumber).trim() : null;
    if (data.copDocument !== undefined) payload.copDocument = data.copDocument ? String(data.copDocument).trim() : null;
    if (data.copValidity !== undefined) {
      if (!data.copValidity) payload.copValidity = null;
      else {
        const d = new Date(data.copValidity);
        if (isNaN(d.getTime())) throw new BadRequestException('Invalid COP validity date');
        payload.copValidity = d;
      }
    }
    if (data.testingAgency !== undefined) {
      payload.testingAgency = data.testingAgency ? String(data.testingAgency).trim() : null;
    }
    if (data.speedLimit !== undefined) {
      payload.speedLimit = data.speedLimit ? String(data.speedLimit).trim() : null;
    }
    // Single approval number + agency → TAC or COP field
    if (data.tacOrCop !== undefined || data.approvalNumber !== undefined) {
      const approval = data.tacOrCop ?? data.approvalNumber;
      const agency = data.testingAgency !== undefined ? data.testingAgency : undefined;
      // If agency not in same payload, leave mapping to caller
      if (agency !== undefined || data.testingAgency !== undefined) {
        const mapped = mapApprovalByAgency(
          agency ?? data.testingAgency,
          approval ? String(approval).trim() : null,
        );
        payload.tacNumber = mapped.tacNumber;
        payload.copNumber = mapped.copNumber;
      }
    }
    return payload;
  }

  async create(data: any, userId?: string) {
    const sldOemId = String(data?.sldOemId || '').trim();
    const name = String(data?.name || '').trim();
    const code = String(data?.code || '').trim().toUpperCase();
    if (!sldOemId || !name || !code) {
      throw new BadRequestException('sldOemId, name and code are required');
    }

    const oem = await this.prisma.sldOem.findUnique({ where: { id: sldOemId } });
    if (!oem) throw new BadRequestException('SLD OEM not found');

    let extra = this.parseModelPayload(data);
    if ((data.tacOrCop || data.approvalNumber) && data.testingAgency) {
      const mapped = mapApprovalByAgency(data.testingAgency, data.tacOrCop || data.approvalNumber);
      extra = { ...extra, tacNumber: mapped.tacNumber, copNumber: mapped.copNumber };
    }

    const model = await this.prisma.sldDeviceModel.create({
      data: {
        sldOemId,
        name,
        code,
        sldType: extra.sldType ?? normalizeSldType(data.sldType) ?? null,
        tacNumber: extra.tacNumber ?? null,
        copNumber: extra.copNumber ?? null,
        copDocument: extra.copDocument ?? null,
        copValidity: extra.copValidity ?? null,
        testingAgency: extra.testingAgency ?? null,
        speedLimit: extra.speedLimit ?? null,
      },
      include: {
        sldOem: true,
        vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }, { setSpeedKmph: 'asc' }] },
        _count: { select: { vehicleModels: true } },
      },
    });

    if (userId) {
      await this.auditService.logAction(
        userId,
        'CREATE_SLD_MODEL',
        'SLD_MODEL',
        model.id,
        `Created model ${model.name} (${model.code}) under ${oem.code}`,
      );
    }

    return model;
  }

  findAll(sldOemId?: string) {
    return this.prisma.sldDeviceModel.findMany({
      where: sldOemId ? { sldOemId } : undefined,
      include: {
        sldOem: true,
        _count: { select: { vehicleModels: true } },
      },
      orderBy: [{ sldOem: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const model = await this.prisma.sldDeviceModel.findUnique({
      where: { id },
      include: {
        sldOem: true,
        vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }, { setSpeedKmph: 'asc' }] },
        _count: { select: { vehicleModels: true } },
      },
    });
    if (!model) throw new NotFoundException('SLD device model not found');
    return model;
  }

  async update(id: string, data: any, userId?: string) {
    await this.findOne(id);
    let updateData = this.parseModelPayload(data);
    if ((data.tacOrCop || data.approvalNumber) && (data.testingAgency !== undefined || updateData.testingAgency)) {
      const existing = await this.prisma.sldDeviceModel.findUnique({ where: { id } });
      const agency = data.testingAgency ?? existing?.testingAgency;
      const mapped = mapApprovalByAgency(agency, data.tacOrCop || data.approvalNumber);
      updateData = { ...updateData, tacNumber: mapped.tacNumber, copNumber: mapped.copNumber };
    }

    const model = await this.prisma.sldDeviceModel.update({
      where: { id },
      data: updateData,
      include: {
        sldOem: true,
        vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }, { setSpeedKmph: 'asc' }] },
        _count: { select: { vehicleModels: true } },
      },
    });

    if (userId) {
      await this.auditService.logAction(
        userId,
        'UPDATE_SLD_MODEL',
        'SLD_MODEL',
        model.id,
        `Updated model ${model.name} (${model.code})`,
      );
    }

    return model;
  }

  async remove(id: string, userId?: string) {
    const model = await this.findOne(id);
    const serialCount = await this.prisma.sldDeviceSerial.count({ where: { modelId: id } });
    if (serialCount > 0) {
      throw new BadRequestException('Cannot delete model with existing inventory serials');
    }
    await this.prisma.sldDeviceModel.delete({ where: { id } });
    if (userId) {
      await this.auditService.logAction(
        userId,
        'DELETE_SLD_MODEL',
        'SLD_MODEL',
        id,
        `Deleted model ${model.name} (${model.code})`,
      );
    }
    return { success: true };
  }

  private parseVehicleCsv(
    csvText: string,
  ): Array<{ make: string; modelName: string; setSpeedKmph: number; testReportNo: string }> {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return [];

    let start = 0;
    const firstCells = lines[0].split(/[,;\t]/).map((c) => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
    const looksLikeHeader =
      firstCells.includes('make') ||
      firstCells.includes('model') ||
      firstCells.includes('modelname') ||
      firstCells.includes('vehicle_model') ||
      firstCells.includes('vehicle model') ||
      firstCells.some((c) => c.includes('speed'));
    if (looksLikeHeader) start = 1;

    const headerMap: Record<string, number> = {};
    if (looksLikeHeader) {
      firstCells.forEach((h, i) => {
        headerMap[h.replace(/\s+/g, '')] = i;
      });
    }

    const rows: Array<{ make: string; modelName: string; setSpeedKmph: number; testReportNo: string }> = [];
    const seen = new Set<string>();

    for (let i = start; i < lines.length; i++) {
      const cells = lines[i].split(/[,;\t]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
      let make = '';
      let modelName = '';
      let speedRaw: string | number = '';
      let testReportNo = '';

      if (looksLikeHeader && Object.keys(headerMap).length) {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const idx = headerMap[k];
            if (idx !== undefined && cells[idx] !== undefined) return cells[idx];
          }
          return '';
        };
        make = get('make', 'vehiclemake') || '';
        modelName = get('model', 'modelname', 'vehiclemodel', 'vehicle_model') || '';
        speedRaw = get('setspeed', 'setspeedkmph', 'speed', 'speedlimit') || '';
        testReportNo = get('testreport', 'testreportnumber', 'testreportno') || '';
      } else if (cells.length >= 3) {
        make = cells[0] || '';
        modelName = cells[1] || '';
        speedRaw = cells[2] || '';
        testReportNo = cells[3] || '';
      } else if (cells.length === 2) {
        make = cells[0] || '';
        modelName = cells[1] || '';
      } else {
        modelName = cells[0] || '';
      }

      if (!modelName) continue;
      const speeds = parseSetSpeeds(speedRaw);
      if (speeds.length === 0) {
        throw new BadRequestException(
          `Row ${i + 1}: set speed (KMPH) is required for vehicle model "${modelName}"`,
        );
      }
      for (const setSpeedKmph of speeds) {
        const key = `${make.toUpperCase()}|${modelName.toUpperCase()}|${setSpeedKmph}|${testReportNo.toUpperCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ make, modelName, setSpeedKmph, testReportNo });
      }
    }

    return rows;
  }

  async listVehicleModels(sldDeviceModelId: string) {
    await this.findOne(sldDeviceModelId);
    return this.prisma.sldApprovedVehicleModel.findMany({
      where: { sldDeviceModelId },
      orderBy: [{ make: 'asc' }, { modelName: 'asc' }, { setSpeedKmph: 'asc' }],
    });
  }

  async uploadVehicleModels(sldDeviceModelId: string, csvText: string, userId?: string) {
    await this.findOne(sldDeviceModelId);
    const rows = this.parseVehicleCsv(csvText);
    if (rows.length === 0) {
      throw new BadRequestException('No vehicle models found in CSV');
    }

    const existing = await this.prisma.sldApprovedVehicleModel.findMany({
      where: { sldDeviceModelId },
      select: { make: true, modelName: true, setSpeedKmph: true, testReportNo: true },
    });
    const existingSet = new Set(
      existing.map(
        (e) =>
          `${(e.make || '').toUpperCase()}|${e.modelName.toUpperCase()}|${e.setSpeedKmph}|${(e.testReportNo || '').toUpperCase()}`,
      ),
    );

    const toCreate = rows.filter(
      (r) =>
        !existingSet.has(
          `${r.make.toUpperCase()}|${r.modelName.toUpperCase()}|${r.setSpeedKmph}|${r.testReportNo.toUpperCase()}`,
        ),
    );
    const alreadyExists = rows.filter((r) =>
      existingSet.has(
        `${r.make.toUpperCase()}|${r.modelName.toUpperCase()}|${r.setSpeedKmph}|${r.testReportNo.toUpperCase()}`,
      ),
    );

    if (toCreate.length > 0) {
      await this.prisma.sldApprovedVehicleModel.createMany({
        data: toCreate.map((r) => ({
          sldDeviceModelId,
          make: r.make,
          modelName: r.modelName,
          setSpeedKmph: r.setSpeedKmph,
          testReportNo: r.testReportNo,
        })),
        skipDuplicates: true,
      });
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'UPLOAD_SLD_VEHICLE_MODELS',
        'SLD_MODEL',
        sldDeviceModelId,
        `Uploaded ${toCreate.length} approved vehicle variants (skipped ${alreadyExists.length} existing)`,
      );
    }

    return {
      created: toCreate.length,
      alreadyExists: alreadyExists.map(
        (r) => `${r.make ? `${r.make} / ` : ''}${r.modelName} @ ${r.setSpeedKmph} km/h`,
      ),
      totalParsed: rows.length,
    };
  }

  async createVehicleModel(
    sldDeviceModelId: string,
    data: { make?: string; modelName: string; setSpeedKmph: number; testReportNo?: string },
    userId?: string,
  ) {
    await this.findOne(sldDeviceModelId);
    const modelName = String(data?.modelName || '').trim();
    if (!modelName) throw new BadRequestException('modelName is required');
    const make = data?.make ? String(data.make).trim() : '';
    const setSpeedKmph = Number(data?.setSpeedKmph);
    if (!Number.isFinite(setSpeedKmph) || setSpeedKmph <= 0) {
      throw new BadRequestException('setSpeedKmph is required and must be a positive number');
    }
    const testReportNo = data?.testReportNo ? String(data.testReportNo).trim() : '';

    try {
      const row = await this.prisma.sldApprovedVehicleModel.create({
        data: { sldDeviceModelId, make, modelName, setSpeedKmph: Math.round(setSpeedKmph), testReportNo },
      });
      if (userId) {
        await this.auditService.logAction(
          userId,
          'CREATE_SLD_VEHICLE_MODEL',
          'SLD_VEHICLE_MODEL',
          row.id,
          `Added vehicle ${make} ${modelName} @ ${setSpeedKmph} km/h`.trim(),
        );
      }
      return row;
    } catch {
      throw new BadRequestException('Vehicle variant already exists for this device model');
    }
  }

  async deleteVehicleModel(id: string, userId?: string) {
    const row = await this.prisma.sldApprovedVehicleModel.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Approved vehicle model not found');
    await this.prisma.sldApprovedVehicleModel.delete({ where: { id } });
    if (userId) {
      await this.auditService.logAction(
        userId,
        'DELETE_SLD_VEHICLE_MODEL',
        'SLD_VEHICLE_MODEL',
        id,
        `Deleted vehicle ${row.make || ''} ${row.modelName} @ ${row.setSpeedKmph}`.trim(),
      );
    }
    return { success: true };
  }

  /**
   * Import standard SLD Variant List rows for an OEM.
   * Creates/updates device models and approved vehicle variants (with set speed).
   */
  async importVariantList(sldOemId: string, rows: VariantListRow[], userId?: string) {
    const oem = await this.prisma.sldOem.findUnique({ where: { id: sldOemId } });
    if (!oem) throw new NotFoundException('SLD OEM not found');
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to import');
    }

    let modelsCreated = 0;
    let modelsUpdated = 0;
    let variantsCreated = 0;
    let variantsSkipped = 0;
    let rowsInvalid = 0;

    const modelCache = new Map<string, { id: string }>();

    for (const raw of rows) {
      const sldModelName = String(raw?.sldModelName || '').trim();
      const vehicleModel = String(raw?.vehicleModel || '').trim();
      const vehicleMake = String(raw?.vehicleMake || '').trim();
      const testingAgency = raw?.testingAgency ? String(raw.testingAgency).trim() : null;
      const tacOrCop = raw?.tacOrCop ? String(raw.tacOrCop).trim() : null;
      const testReportNo = raw?.testReportNo ? String(raw.testReportNo).trim() : '';
      const sldType = normalizeSldType(raw?.sldType);
      const speeds = parseSetSpeeds(raw?.setSpeed);

      if (!sldModelName || !vehicleModel || speeds.length === 0) {
        rowsInvalid++;
        continue;
      }

      const code = modelCodeFromName(sldModelName);
      let device = modelCache.get(code);
      if (!device) {
        const existing = await this.prisma.sldDeviceModel.findUnique({
          where: { sldOemId_code: { sldOemId, code } },
        });
        const mapped = mapApprovalByAgency(testingAgency, tacOrCop);
        if (existing) {
          await this.prisma.sldDeviceModel.update({
            where: { id: existing.id },
            data: {
              name: sldModelName,
              sldType: sldType ?? existing.sldType,
              testingAgency: testingAgency ?? existing.testingAgency,
              ...(tacOrCop
                ? { tacNumber: mapped.tacNumber, copNumber: mapped.copNumber }
                : {}),
            },
          });
          modelsUpdated++;
          device = { id: existing.id };
        } else {
          const created = await this.prisma.sldDeviceModel.create({
            data: {
              sldOemId,
              name: sldModelName,
              code,
              sldType,
              testingAgency,
              tacNumber: mapped.tacNumber,
              copNumber: mapped.copNumber,
            },
          });
          modelsCreated++;
          device = { id: created.id };
        }
        modelCache.set(code, device);
      }

      for (const setSpeedKmph of speeds) {
        try {
          await this.prisma.sldApprovedVehicleModel.create({
            data: {
              sldDeviceModelId: device.id,
              make: vehicleMake,
              modelName: vehicleModel,
              setSpeedKmph,
              testReportNo,
            },
          });
          variantsCreated++;
        } catch {
          variantsSkipped++;
        }
      }
    }

    if (userId) {
      await this.auditService.logAction(
        userId,
        'IMPORT_SLD_VARIANT_LIST',
        'SLD_OEM',
        sldOemId,
        `Imported variant list: models +${modelsCreated}/~${modelsUpdated}, variants +${variantsCreated}, skipped ${variantsSkipped}, invalid ${rowsInvalid}`,
      );
    }

    return {
      modelsCreated,
      modelsUpdated,
      variantsCreated,
      variantsSkipped,
      rowsInvalid,
      rowsReceived: rows.length,
    };
  }
}
