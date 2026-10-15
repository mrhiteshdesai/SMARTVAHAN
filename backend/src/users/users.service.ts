import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService
  ) {}

  private sanitizePayload(data: any) {
    const {
      sldOemIds,
      authorizedSldOems,
      password,
      ...rest
    } = data || {};
    return {
      rest,
      password,
      sldOemIds: Array.isArray(sldOemIds)
        ? sldOemIds.filter((id: unknown) => typeof id === 'string' && id.trim())
        : undefined,
    };
  }

  async create(data: any, createdByUserId?: string): Promise<any> {
    try {
        const { rest, password, sldOemIds } = this.sanitizePayload(data);
        if (!password) {
            throw new BadRequestException('Password is required');
        }

        if (rest.email && String(rest.email).trim() === '') {
            rest.email = null;
        } else if (!rest.email) {
            rest.email = null;
        }

        if (rest.role === UserRole.SLD_ADMIN && (!sldOemIds || sldOemIds.length === 0)) {
            throw new BadRequestException('SLD Admin requires at least one authorized SLD OEM');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await this.prisma.user.create({
            data: {
                ...rest,
                password: hashedPassword,
                ...(rest.role === UserRole.SLD_ADMIN && sldOemIds
                  ? { authorizedSldOems: { connect: sldOemIds.map((id: string) => ({ id })) } }
                  : {}),
            },
            include: {
              authorizedSldOems: { select: { id: true, code: true, name: true } },
            },
        });
        
        if (createdByUserId) {
            await this.auditService.logAction(
                createdByUserId,
                'CREATE_USER',
                'USER',
                user.id,
                `Created user ${user.name} (${user.role})`
            );
        }
        
        const { password: _, ...safe } = user;
        return safe;
    } catch (error) {
        if (error.code === 'P2002') {
            throw new ConflictException('User with this email or phone already exists');
        }
        throw error;
    }
  }

  async findAll(): Promise<any[]> {
    const users = await this.prisma.user.findMany({
        where: {
            role: { not: UserRole.GHOST_ADMIN }
        },
        include: {
          authorizedSldOems: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' }
    });
    return users.map(({ password, ...u }) => u);
  }

  async findOne(id: string): Promise<any | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        authorizedSldOems: { select: { id: true, code: true, name: true } },
      },
    });
    if (!user) return null;
    const { password, ...safe } = user;
    return safe;
  }

  async update(id: string, data: any): Promise<any> {
    try {
        const { rest, password, sldOemIds } = this.sanitizePayload(data);
        const updateData: any = { ...rest };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        if (typeof updateData.email !== 'undefined') {
             if (updateData.email && String(updateData.email).trim() === '') {
                 updateData.email = null;
             } else if (!updateData.email) {
                 updateData.email = null;
             }
        }

        const existing = await this.prisma.user.findUnique({ where: { id } });
        if (!existing) throw new BadRequestException('User not found');

        const nextRole = updateData.role || existing.role;
        if (nextRole === UserRole.SLD_ADMIN && sldOemIds !== undefined && sldOemIds.length === 0) {
            throw new BadRequestException('SLD Admin requires at least one authorized SLD OEM');
        }

        if (sldOemIds !== undefined) {
          if (nextRole === UserRole.SLD_ADMIN) {
            updateData.authorizedSldOems = {
              set: sldOemIds.map((oemId: string) => ({ id: oemId })),
            };
          } else {
            updateData.authorizedSldOems = { set: [] };
          }
        } else if (updateData.role && updateData.role !== UserRole.SLD_ADMIN && existing.role === UserRole.SLD_ADMIN) {
          updateData.authorizedSldOems = { set: [] };
        }

        const user = await this.prisma.user.update({
            where: { id },
            data: updateData,
            include: {
              authorizedSldOems: { select: { id: true, code: true, name: true } },
            },
        });
        const { password: _, ...safe } = user;
        return safe;
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
