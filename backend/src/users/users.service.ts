import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
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
    try {
        if (!data.password) {
            throw new BadRequestException('Password is required');
        }

        // Handle empty email -> null to avoid unique constraint violation on empty strings
        if (data.email && data.email.trim() === '') {
            data.email = null;
        } else if (!data.email) {
            data.email = null;
        }

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
    } catch (error) {
        if (error.code === 'P2002') {
            throw new ConflictException('User with this email or phone already exists');
        }
        throw error;
    }
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
        where: {
            role: { not: UserRole.GHOST_ADMIN }
        },
        orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async update(id: string, data: any): Promise<User> {
    try {
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 10);
        }

        // Handle empty email -> null
        if (typeof data.email !== 'undefined') {
             if (data.email && data.email.trim() === '') {
                 data.email = null;
             } else if (!data.email) {
                 data.email = null;
             }
        }

        return await this.prisma.user.update({
            where: { id },
            data,
        });
    } catch (error) {
        if (error.code === 'P2002') {
            throw new ConflictException('User with this email or phone already exists');
        }
        throw error;
    }
  }

  async remove(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
