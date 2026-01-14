import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class VehicleCategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vehicleCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
