import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class VehicleManufacturersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vehicleManufacturer.findMany({
      orderBy: { name: 'asc' },
    });
  }
}

