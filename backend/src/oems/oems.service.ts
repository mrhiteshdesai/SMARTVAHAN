import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OEM, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OemsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any): Promise<OEM> {
    const { username, password, ...oemData } = data;

    // If username/password provided, create user transactionally
    if (username && password) {
         // Check if user exists
         const existingUser = await this.prisma.user.findUnique({ where: { phone: username } });
         if (existingUser) {
             throw new BadRequestException('User with this phone number already exists');
         }

        const hashedPassword = await bcrypt.hash(password, 10);

        return this.prisma.$transaction(async (tx) => {
            const oem = await tx.oEM.create({ data: oemData });
            
            await tx.user.create({
                data: {
                    name: `${oemData.name} Admin`,
                    phone: username,
                    password: hashedPassword,
                    role: UserRole.OEM_ADMIN,
                    oemCode: oem.code,
                    status: 'ACTIVE'
                }
            });

            return oem;
        });
    }

    return this.prisma.oEM.create({ data: oemData });
  }

  async findAll(): Promise<OEM[]> {
    return this.prisma.oEM.findMany({
      include: {
        users: {
          where: {
            role: 'OEM_ADMIN'
          }
        }
      }
    });
  }

  async findOne(id: string): Promise<OEM | null> {
    return this.prisma.oEM.findUnique({ where: { id } });
  }

  async update(id: string, data: any): Promise<OEM> {
    return this.prisma.oEM.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<OEM> {
    return this.prisma.oEM.delete({ where: { id } });
  }
}
