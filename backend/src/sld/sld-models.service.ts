import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

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

    const extra = this.parseModelPayload(data);

    const model = await this.prisma.sldDeviceModel.create({
      data: {
        sldOemId,
        name,
        code,
        tacNumber: extra.tacNumber ?? null,
        copNumber: extra.copNumber ?? null,
        copDocument: extra.copDocument ?? null,
        copValidity: extra.copValidity ?? null,
        testingAgency: extra.testingAgency ?? null,
        speedLimit: extra.speedLimit ?? null,
      },
      include: {
        sldOem: true,
        vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }] },
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
        vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }] },
        _count: { select: { vehicleModels: true } },
      },
    });
    if (!model) throw new NotFoundException('SLD device model not found');
    return model;
  }

  async update(id: string, data: any, userId?: string) {
    await this.findOne(id);
    const updateData = this.parseModelPayload(data);

    const model = await this.prisma.sldDeviceModel.update({
      where: { id },
      data: updateData,
      include: {
        sldOem: true,
        vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }] },
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

  private parseVehicleCsv(csvText: string): Array<{ make: string | null; modelName: string }> {
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
      firstCells.includes('vehicle model');
    if (looksLikeHeader) start = 1;

    const rows: Array<{ make: string | null; modelName: string }> = [];
    const seen = new Set<string>();

    for (let i = start; i < lines.length; i++) {
      const cells = lines[i].split(/[,;\t]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
      let make: string | null = null;
      let modelName = '';
      if (cells.length >= 2) {
        make = cells[0] || null;
        modelName = cells.slice(1).join(',').trim();
      } else {
        modelName = cells[0] || '';
      }
      if (!modelName) continue;
      const key = `${(make || '').toUpperCase()}|${modelName.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ make, modelName });
    }

    return rows;
  }

  async listVehicleModels(sldDeviceModelId: string) {
    await this.findOne(sldDeviceModelId);
    return this.prisma.sldApprovedVehicleModel.findMany({
      where: { sldDeviceModelId },
      orderBy: [{ make: 'asc' }, { modelName: 'asc' }],
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
      select: { make: true, modelName: true },
    });
    const existingSet = new Set(
      existing.map((e) => `${(e.make || '').toUpperCase()}|${e.modelName.toUpperCase()}`),
    );

    const toCreate = rows.filter(
      (r) => !existingSet.has(`${(r.make || '').toUpperCase()}|${r.modelName.toUpperCase()}`),
    );
    const alreadyExists = rows.filter((r) =>
      existingSet.has(`${(r.make || '').toUpperCase()}|${r.modelName.toUpperCase()}`),
    );

    if (toCreate.length > 0) {
      await this.prisma.sldApprovedVehicleModel.createMany({
        data: toCreate.map((r) => ({
          sldDeviceModelId,
          make: r.make,
          modelName: r.modelName,
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
        `Uploaded ${toCreate.length} approved vehicle models (skipped ${alreadyExists.length} existing)`,
      );
    }

    return {
      created: toCreate.length,
      alreadyExists: alreadyExists.map((r) => (r.make ? `${r.make} / ${r.modelName}` : r.modelName)),
      totalParsed: rows.length,
    };
  }

  async createVehicleModel(
    sldDeviceModelId: string,
    data: { make?: string; modelName: string },
    userId?: string,
  ) {
    await this.findOne(sldDeviceModelId);
    const modelName = String(data?.modelName || '').trim();
    if (!modelName) throw new BadRequestException('modelName is required');
    const make = data?.make ? String(data.make).trim() : null;

    try {
      const row = await this.prisma.sldApprovedVehicleModel.create({
        data: { sldDeviceModelId, make, modelName },
      });
      if (userId) {
        await this.auditService.logAction(
          userId,
          'CREATE_SLD_VEHICLE_MODEL',
          'SLD_VEHICLE_MODEL',
          row.id,
          `Added vehicle model ${make || ''} ${modelName}`.trim(),
        );
      }
      return row;
    } catch {
      throw new BadRequestException('Vehicle model already exists for this device model');
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
        `Deleted vehicle model ${row.make || ''} ${row.modelName}`.trim(),
      );
    }
    return { success: true };
  }
}
