import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Product } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.product.findMany();
  }

  async create(data: { code: string; name: string }) {
    return this.prisma.product.create({ data });
  }
}
