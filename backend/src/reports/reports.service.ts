import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private getProductColumns() {
    // List of products to pivot
    return ['C3', 'C4', 'CT', 'CTAUTO'];
  }

  // 1. State Report
  async getStateReport(filters: { startDate?: string; endDate?: string }) {
    const { startDate, endDate } = filters;
    let dateFilter = '';
    
    if (startDate && endDate) {
      dateFilter = `AND c."generatedAt" >= '${startDate}'::timestamp AND c."generatedAt" <= '${endDate} 23:59:59'::timestamp`;
    }

    // We join Certificate -> QRCode -> Batch -> State
    // Group by State Name (via Batch.stateCode -> State.name)
    const query = `
      SELECT 
        s.name as "State Name",
        COUNT(CASE WHEN b."productCode" = 'C3' THEN 1 END)::int as "C3",
        COUNT(CASE WHEN b."productCode" = 'C4' THEN 1 END)::int as "C4",
        COUNT(CASE WHEN b."productCode" = 'CT' THEN 1 END)::int as "CT",
        COUNT(CASE WHEN b."productCode" = 'CTAUTO' THEN 1 END)::int as "CTAUTO",
        COUNT(*)::int as "Total"
      FROM certificates c
      JOIN qr_codes q ON c."qrCodeId" = q.id
      JOIN batches b ON q."batchId" = b.id
      JOIN states s ON b."stateCode" = s.code
      WHERE 1=1 ${dateFilter}
      GROUP BY s.name
      ORDER BY s.name ASC
    `;

    return this.prisma.$queryRawUnsafe(query);
  }

  // 2. RTO Report
  async getRtoReport(filters: { stateCode?: string; startDate?: string; endDate?: string }) {
    const { stateCode, startDate, endDate } = filters;
    let whereClause = 'WHERE 1=1';

    if (stateCode) whereClause += ` AND b."stateCode" = '${stateCode}'`;
    if (startDate && endDate) {
      whereClause += ` AND c."generatedAt" >= '${startDate}'::timestamp AND c."generatedAt" <= '${endDate} 23:59:59'::timestamp`;
    }

    // Group by Certificate.passingRto (or registrationRto). User usually means Passing RTO.
    const query = `
      SELECT 
        c."passingRto" as "RTO",
        COUNT(CASE WHEN b."productCode" = 'C3' THEN 1 END)::int as "C3",
        COUNT(CASE WHEN b."productCode" = 'C4' THEN 1 END)::int as "C4",
        COUNT(CASE WHEN b."productCode" = 'CT' THEN 1 END)::int as "CT",
        COUNT(CASE WHEN b."productCode" = 'CTAUTO' THEN 1 END)::int as "CTAUTO",
        COUNT(*)::int as "Total"
      FROM certificates c
      JOIN qr_codes q ON c."qrCodeId" = q.id
      JOIN batches b ON q."batchId" = b.id
      ${whereClause}
      GROUP BY c."passingRto"
      ORDER BY c."passingRto" ASC
    `;

    return this.prisma.$queryRawUnsafe(query);
  }

  // 3. OEM Report
  async getOemReport(filters: { stateCode?: string; startDate?: string; endDate?: string }) {
    const { stateCode, startDate, endDate } = filters;
    let whereClause = 'WHERE 1=1';

    if (stateCode) whereClause += ` AND b."stateCode" = '${stateCode}'`;
    if (startDate && endDate) {
      whereClause += ` AND c."generatedAt" >= '${startDate}'::timestamp AND c."generatedAt" <= '${endDate} 23:59:59'::timestamp`;
    }

    const query = `
      SELECT 
        o.name as "OEM Name",
        COUNT(CASE WHEN b."productCode" = 'C3' THEN 1 END)::int as "C3",
        COUNT(CASE WHEN b."productCode" = 'C4' THEN 1 END)::int as "C4",
        COUNT(CASE WHEN b."productCode" = 'CT' THEN 1 END)::int as "CT",
        COUNT(CASE WHEN b."productCode" = 'CTAUTO' THEN 1 END)::int as "CTAUTO",
        COUNT(*)::int as "Total"
      FROM certificates c
      JOIN qr_codes q ON c."qrCodeId" = q.id
      JOIN batches b ON q."batchId" = b.id
      JOIN oems o ON b."oemCode" = o.code
      ${whereClause}
      GROUP BY o.name
      ORDER BY o.name ASC
    `;

    return this.prisma.$queryRawUnsafe(query);
  }

  // 4. Dealer Report
  async getDealerReport(filters: { stateCode?: string; oemCode?: string; startDate?: string; endDate?: string }) {
    const { stateCode, oemCode, startDate, endDate } = filters;
    let whereClause = 'WHERE 1=1';

    if (stateCode) whereClause += ` AND b."stateCode" = '${stateCode}'`;
    if (oemCode) whereClause += ` AND b."oemCode" = '${oemCode}'`;
    if (startDate && endDate) {
      whereClause += ` AND c."generatedAt" >= '${startDate}'::timestamp AND c."generatedAt" <= '${endDate} 23:59:59'::timestamp`;
    }

    // Dealer info is in Certificate.dealerId (nullable)
    // We join 'dealers' table
    const query = `
      SELECT 
        d.name as "Dealer Name",
        d.city as "City",
        COUNT(CASE WHEN b."productCode" = 'C3' THEN 1 END)::int as "C3",
        COUNT(CASE WHEN b."productCode" = 'C4' THEN 1 END)::int as "C4",
        COUNT(CASE WHEN b."productCode" = 'CT' THEN 1 END)::int as "CT",
        COUNT(CASE WHEN b."productCode" = 'CTAUTO' THEN 1 END)::int as "CTAUTO",
        COUNT(*)::int as "Total"
      FROM certificates c
      JOIN qr_codes q ON c."qrCodeId" = q.id
      JOIN batches b ON q."batchId" = b.id
      LEFT JOIN dealers d ON c."dealerId" = d.id
      ${whereClause}
      GROUP BY d.name, d.city
      ORDER BY "Total" DESC
    `;

    return this.prisma.$queryRawUnsafe(query);
  }
}
