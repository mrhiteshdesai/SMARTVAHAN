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
    if (stateCode) {
        return this.prisma.rTO.findMany({ where: { stateCode } });
    }
    return this.prisma.rTO.findMany();
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
