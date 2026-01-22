import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { User, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService
  ) {}

  async create(data: any, createdByUserId?: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
    
    // Audit Log
    if (createdByUserId) {
        await this.auditService.logAction(
            createdByUserId,
            'CREATE_USER',
            'USER',
            user.id,
            `Created user ${user.name} (${user.role})`
        );
    }
    
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async update(id: string, data: any): Promise<User> {
    if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
    }
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
