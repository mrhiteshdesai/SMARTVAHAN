import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RTO } from '@prisma/client';

@Injectable()
export class RtosService {
  constructor(private prisma: PrismaService) {}

  async create(data: any): Promise<RTO> {
    return this.prisma.rTO.create({ data });
  }

  async findAll(stateCode?: string): Promise<RTO[]> {
    const normalizedStateCode = stateCode ? stateCode.trim().toUpperCase() : '';
    if (normalizedStateCode) {
        return this.prisma.rTO.findMany({ where: { stateCode: normalizedStateCode }, orderBy: { name: 'asc' } });
    }
    return this.prisma.rTO.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(code: string): Promise<RTO | null> {
    return this.prisma.rTO.findUnique({ where: { code } });
  }

  async update(code: string, data: any): Promise<RTO> {
    return this.prisma.rTO.update({
      where: { code },
      data,
    });
  }

  async remove(code: string): Promise<RTO> {
    return this.prisma.rTO.delete({ where: { code } });
  }
}
