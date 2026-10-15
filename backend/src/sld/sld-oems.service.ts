import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SldOemsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(data: any, userId?: string) {
    const name = String(data?.name || '').trim();
    const code = String(data?.code || '').trim().toUpperCase();
    if (!name || !code) {
      throw new BadRequestException('name and code are required');
    }

    let authorizedStates: string[] = [];
    if (Array.isArray(data.authorizedStates)) {
      authorizedStates = data.authorizedStates.map((s: any) => String(s).trim()).filter(Boolean);
    }

    const oem = await this.prisma.sldOem.create({
      data: {
        name,
        code,
        authorizedStates,
        logo: data.logo ? String(data.logo) : null,
      },
      include: { models: true },
    });

    if (userId) {
      await this.auditService.logAction(
        userId,
        'CREATE_SLD_OEM',
        'SLD_OEM',
        oem.id,
        `Created SLD OEM ${oem.name} (${oem.code})`,
      );
    }

    return oem;
  }

  findAll(opts?: { dealerId?: string; userId?: string }) {
    const where = opts?.dealerId
      ? { dealers: { some: { id: opts.dealerId } } }
      : opts?.userId
        ? { authorizedUsers: { some: { id: opts.userId } } }
        : undefined;
    return this.prisma.sldOem.findMany({
      where,
      include: {
        models: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { vehicleModels: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const oem = await this.prisma.sldOem.findUnique({
      where: { id },
      include: {
        models: {
          orderBy: { name: 'asc' },
          include: {
            vehicleModels: { orderBy: [{ make: 'asc' }, { modelName: 'asc' }] },
            _count: { select: { vehicleModels: true } },
          },
        },
      },
    });
    if (!oem) throw new NotFoundException('SLD OEM not found');
    return oem;
  }

  async update(id: string, data: any, userId?: string) {
    await this.findOne(id);
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = String(data.name).trim();
    if (data.code !== undefined) updateData.code = String(data.code).trim().toUpperCase();
    if (data.logo !== undefined) updateData.logo = data.logo ? String(data.logo) : null;
    if (data.authorizedStates !== undefined) {
      updateData.authorizedStates = Array.isArray(data.authorizedStates)
        ? data.authorizedStates.map((s: any) => String(s).trim()).filter(Boolean)
        : [];
    }

    const oem = await this.prisma.sldOem.update({
      where: { id },
      data: updateData,
      include: {
        models: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { vehicleModels: true } } },
        },
      },
    });

    if (userId) {
      await this.auditService.logAction(
        userId,
        'UPDATE_SLD_OEM',
        'SLD_OEM',
        oem.id,
        `Updated SLD OEM ${oem.name} (${oem.code})`,
      );
    }

    return oem;
  }

  async remove(id: string, userId?: string) {
    const oem = await this.findOne(id);
    const serialCount = await this.prisma.sldDeviceSerial.count({ where: { sldOemId: id } });
    if (serialCount > 0) {
      throw new BadRequestException('Cannot delete SLD OEM with existing inventory serials');
    }
    await this.prisma.sldOem.delete({ where: { id } });
    if (userId) {
      await this.auditService.logAction(
        userId,
        'DELETE_SLD_OEM',
        'SLD_OEM',
        id,
        `Deleted SLD OEM ${oem.name} (${oem.code})`,
      );
    }
    return { success: true };
  }
}
