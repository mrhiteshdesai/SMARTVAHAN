import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getStats(filters: { stateCode?: string; oemCode?: string; startDate?: string; endDate?: string }) {
    const whereLog: any = {};
    const whereBatch: any = { status: 'COMPLETED' };
    const whereCertificate: any = {};

    if (filters.stateCode) {
        whereLog.stateCode = filters.stateCode;
        whereBatch.stateCode = filters.stateCode;
    }
    if (filters.oemCode) {
        whereLog.oemCode = filters.oemCode;
        whereBatch.oemCode = filters.oemCode;
    }

    if (filters.startDate && filters.endDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);

        whereLog.createdAt = { gte: start, lte: end };
        whereBatch.createdAt = { gte: start, lte: end };
        whereCertificate.generatedAt = { gte: start, lte: end };
    }

    // Initialize stats
    const products = ['C3', 'C4', 'CT', 'CTAUTO'];
    const stats = {
        inward: { C3: 0, C4: 0, CT: 0, CTAUTO: 0, total: 0 },
        outward: { C3: 0, C4: 0, CT: 0, CTAUTO: 0, total: 0 },
        instock: { C3: 0, C4: 0, CT: 0, CTAUTO: 0, total: 0 },
        used: { C3: 0, C4: 0, CT: 0, CTAUTO: 0, total: 0 }
    };

    // 1. Calculate Inward from Batches (Source of Truth for Production)
    const batchGroups = await this.prisma.batch.groupBy({
        by: ['productCode'],
        _sum: { quantity: true },
        where: whereBatch
    });

    batchGroups.forEach(g => {
        const p = g.productCode;
        const qty = g._sum.quantity || 0;
        if (stats.inward[p] !== undefined) {
            stats.inward[p] += qty;
            stats.inward.total += qty;
        }
    });

    // 2. Calculate Inward/Outward from InventoryLogs (Manual Adjustments & Sales)
    const logGroups = await this.prisma.inventoryLog.groupBy({
        by: ['productCode', 'type'],
        _sum: { quantity: true },
        where: whereLog
    });

    logGroups.forEach(g => {
        const p = g.productCode;
        const qty = g._sum.quantity || 0;
        
        if (g.type === 'INWARD') {
            if (stats.inward[p] !== undefined) {
                stats.inward[p] += qty;
                stats.inward.total += qty;
            }
        } else if (g.type === 'OUTWARD') {
            if (stats.outward[p] !== undefined) {
                stats.outward[p] += qty;
                stats.outward.total += qty;
            }
        }
    });

    // 3. Calculate Used (Certificates Generated)
    // Since we cannot groupBy deep relations easily, we'll iterate products or fetch flattened data
    // Efficient approach: Count certificates where QRCode -> Batch -> matches filters
    for (const p of products) {
        const count = await this.prisma.certificate.count({
            where: {
                ...whereCertificate,
                qrCode: {
                    batch: {
                        productCode: p,
                        stateCode: filters.stateCode, // undefined is ignored by Prisma? No, need to check
                        oemCode: filters.oemCode
                    }
                }
            }
        });
        stats.used[p] = count;
        stats.used.total += count;
    }

    // 4. Calculate Instock (Instock is cumulative, so date filters might be weird for Instock?)
    // Usually Instock is "Current State", not "State in that period".
    // If Date Range is applied, Inward/Outward/Used show activity in that range.
    // But Instock should probably show *current* available stock regardless of date filter?
    // OR "Stock at end of period"?
    // Standard logic: Instock is always current (Total Inward - Total Outward).
    // If user filters by date, they see movement.
    // However, if we filter Inward/Outward by date, calculating Instock = Inward - Outward based on filtered data is WRONG.
    // Instock should be calculated from ALL TIME data.
    
    // Let's recalculate Instock using ALL TIME data, separate from the filtered stats.
    const allTimeBatch = await this.prisma.batch.groupBy({
        by: ['productCode'],
        _sum: { quantity: true },
        where: { 
            status: 'COMPLETED',
            stateCode: filters.stateCode,
            oemCode: filters.oemCode
        }
    });
    
    const allTimeLogs = await this.prisma.inventoryLog.groupBy({
        by: ['productCode', 'type'],
        _sum: { quantity: true },
        where: {
            stateCode: filters.stateCode,
            oemCode: filters.oemCode
        }
    });

    const instockCalc = { C3: 0, C4: 0, CT: 0, CTAUTO: 0 };
    
    allTimeBatch.forEach(g => {
        if(instockCalc[g.productCode] !== undefined) instockCalc[g.productCode] += (g._sum.quantity || 0);
    });

    allTimeLogs.forEach(g => {
        const qty = g._sum.quantity || 0;
        if(instockCalc[g.productCode] !== undefined) {
            if (g.type === 'INWARD') instockCalc[g.productCode] += qty;
            if (g.type === 'OUTWARD') instockCalc[g.productCode] -= qty;
        }
    });

    products.forEach(p => {
        stats.instock[p] = instockCalc[p];
    });
    stats.instock.total = Object.values(instockCalc).reduce((a, b) => a + b, 0);

    return stats;
  }

  async getLogs(filters: { stateCode?: string; oemCode?: string; dealerId?: string; startDate?: string; endDate?: string }) {
    const whereLog: any = {};
    const whereBatch: any = { status: 'COMPLETED' };

    if (filters.stateCode) {
        whereLog.stateCode = filters.stateCode;
        whereBatch.stateCode = filters.stateCode;
    }
    if (filters.oemCode) {
        whereLog.oemCode = filters.oemCode;
        whereBatch.oemCode = filters.oemCode;
    }

    // Filter logs for Dealer (Own logs + Shared/Admin logs where dealerId is null)
    if (filters.dealerId) {
        whereLog.OR = [
            { dealerId: filters.dealerId },
            { dealerId: null }
        ];
    }

    if (filters.startDate && filters.endDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);

        whereLog.createdAt = { gte: start, lte: end };
        whereBatch.createdAt = { gte: start, lte: end };
    }

    // Fetch Logs with Dealer info
    const logs = await this.prisma.inventoryLog.findMany({
      where: whereLog,
      include: {
        dealer: {
            select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    // Fetch Batches
    const batches = await this.prisma.batch.findMany({
        where: whereBatch,
        orderBy: { createdAt: 'desc' },
        take: 500
    });

    // Map Batches to Log format
    const batchLogs = batches.map(b => ({
        id: b.id,
        type: 'INWARD',
        stateCode: b.stateCode,
        oemCode: b.oemCode,
        productCode: b.productCode,
        quantity: b.quantity,
        serialStart: b.startSerial,
        serialEnd: b.endSerial,
        remark: 'Batch Generation',
        dealer: null,
        createdAt: b.createdAt,
        userId: b.userId
    }));

    // Merge and Sort
    const combined = [...logs, ...batchLogs].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return combined.slice(0, 100);
  }

  async createOutward(data: any, userId: string) {
    // Validation
    if (!data.serialStart || !data.serialEnd) {
        throw new BadRequestException("Serial Start and Serial End are required.");
    }

    // 1. Check current stock
    const stats = await this.getStats({
      stateCode: data.stateCode,
      oemCode: data.oemCode
    });

    const currentStock = stats.instock[data.productCode] || 0;

    if (currentStock < Number(data.quantity)) {
      throw new BadRequestException(`Insufficient stock for ${data.productCode}. Current stock: ${currentStock}`);
    }

    // 2. Create Outward Log
    return this.prisma.inventoryLog.create({
      data: {
        type: 'OUTWARD',
        stateCode: data.stateCode,
        oemCode: data.oemCode,
        productCode: data.productCode,
        quantity: Number(data.quantity),
        serialStart: data.serialStart,
        serialEnd: data.serialEnd,
        remark: data.remark,
        dealerId: data.dealerId || null,
        userId: userId,
      }
    });
  }
}
