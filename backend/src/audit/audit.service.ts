import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async logAction(userId: string, action: string, entity: string, entityId: string, details: string, ipAddress?: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          entity,
          entityId,
          details,
          ipAddress
        }
      });
    } catch (error) {
      console.error('Failed to create audit log', error);
      // Don't throw, we don't want to block the main action
    }
  }

  async getLogs(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    
    const where: any = {};
    if (search) {
        where.OR = [
            { action: { contains: search, mode: 'insensitive' } },
            { entity: { contains: search, mode: 'insensitive' } },
            { details: { contains: search, mode: 'insensitive' } },
            { user: { name: { contains: search, mode: 'insensitive' } } }
        ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
            user: {
                select: { name: true, email: true, role: true }
            }
        }
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}
