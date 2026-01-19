import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(query: { stateCode?: string; oemCode?: string; startDate?: string; endDate?: string }) {
    const { stateCode, oemCode, startDate, endDate } = query;
    
    const dateFilter = startDate && endDate ? {
        generatedAt: {
            gte: new Date(startDate),
            lte: new Date(endDate)
        }
    } : {};

    const whereBatch = {
        ...(stateCode && { stateCode }),
        ...(oemCode && { oemCode })
    };

    const whereCert = {
        ...dateFilter,
        qrCode: {
            batch: whereBatch
        }
    };

    const products = ['C3', 'C4', 'CT', 'CTAUTO'];

    // --- Row 1: Certificates Generated Today by Product ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCerts = await this.prisma.certificate.findMany({
        where: {
            generatedAt: {
                gte: today,
                lt: tomorrow
            },
            qrCode: { batch: whereBatch }
        },
        include: {
            qrCode: {
                include: {
                    batch: true
                }
            }
        }
    });

    const row1: Record<string, number> = {};
    products.forEach(p => row1[p] = 0);
    todayCerts.forEach(c => {
        const p = c.qrCode.batch.productCode;
        if (row1[p] !== undefined) row1[p]++;
    });

    // --- Row 2: Certs Today, Yesterday, This Week ---
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayCertsCount = await this.prisma.certificate.count({
        where: {
            generatedAt: {
                gte: yesterday,
                lt: today
            },
            qrCode: { batch: whereBatch }
        }
    });

    // Get Monday of current week
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const startOfWeek = new Date(today.setDate(diff));
    startOfWeek.setHours(0,0,0,0);
    
    // Reset today for correct bar chart logic later if mutated
    const todayForWeek = new Date();
    todayForWeek.setHours(0,0,0,0);
    const startOfWeekActual = new Date(todayForWeek);
    const dayOfWeek = todayForWeek.getDay(); // 0 (Sun) to 6 (Sat)
    const diff2 = todayForWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startOfWeekActual.setDate(diff2);

    const weekCertsCount = await this.prisma.certificate.count({
        where: {
            generatedAt: {
                gte: startOfWeekActual
            },
            qrCode: { batch: whereBatch }
        }
    });

    const row2 = {
        today: todayCerts.length,
        yesterday: yesterdayCertsCount,
        thisWeek: weekCertsCount
    };

    // --- Row 3: Totals ---
    const totalQrIssued = await this.prisma.qRCode.count({
        where: {
            batch: whereBatch
        }
    });
    
    const totalQrUsed = await this.prisma.qRCode.count({
        where: {
            batch: whereBatch,
            OR: [
                { status: { gt: 0 } },
                { certificate: { isNot: null } }
            ]
        }
    });

    const totalCerts = await this.prisma.certificate.count({
        where: {
            qrCode: { batch: whereBatch }
        }
    });

    // Active Dealers
    const dealerWhere: any = { status: 'ACTIVE' };
    if (stateCode) dealerWhere.stateCode = stateCode;
    if (oemCode) dealerWhere.oems = { some: { code: oemCode } };

    const totalActiveDealers = await this.prisma.dealer.count({
        where: dealerWhere
    });

    const row3 = {
        totalQrIssued,
        totalQrUsed,
        totalCerts,
        totalActiveDealers
    };

    // --- Row 4: QR Metrics by Product (Issued/Used) ---
    const row4: Record<string, { issued: number; used: number }> = {};
    for (const p of products) {
        const issued = await this.prisma.qRCode.count({
            where: {
                batch: { ...whereBatch, productCode: p }
            }
        });
        const used = await this.prisma.qRCode.count({
            where: {
                batch: { ...whereBatch, productCode: p },
                OR: [
                    { status: { gt: 0 } },
                    { certificate: { isNot: null } }
                ]
            }
        });
        row4[p] = { issued, used };
    }

    // --- Charts: Bar Graph (Last 7 Days + Today) ---
    const barData: any[] = [];
    const todayRef = new Date();
    todayRef.setHours(0,0,0,0);
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(todayRef);
        d.setDate(d.getDate() - i);
        const nextD = new Date(d);
        nextD.setDate(d.getDate() + 1);

        const dayCerts = await this.prisma.certificate.findMany({
            where: {
                generatedAt: {
                    gte: d,
                    lt: nextD
                },
                qrCode: { batch: whereBatch }
            },
            include: { qrCode: { include: { batch: true } } }
        });

        const dayStat: any = { date: d.toISOString().split('T')[0] };
        products.forEach(p => dayStat[p] = 0);
        dayCerts.forEach(c => {
            const p = c.qrCode.batch.productCode;
            if (dayStat[p] !== undefined) dayStat[p]++;
        });
        barData.push(dayStat);
    }

    // --- Charts: Heatmap (Density by RTO) ---
    const rtoGroups = await this.prisma.certificate.groupBy({
        by: ['registrationRto'],
        where: {
             qrCode: { batch: whereBatch },
             ...dateFilter
        },
        _count: {
            id: true
        }
    });
    
    const rtoDensity = rtoGroups.map(g => ({
        rto: g.registrationRto,
        count: g._count.id
    })).sort((a, b) => b.count - a.count);

    // --- Heatmap Data (Based on Certificate.locationText) ---
    // Fetch all certificates with locationText for the current filter
    // We only need locationText field.
    const certsWithLocation = await this.prisma.certificate.findMany({
        where: {
             qrCode: { batch: whereBatch },
             ...dateFilter,
             locationText: { not: null }
        },
        select: { locationText: true }
    });

    const locationMap = new Map<string, number>();

    certsWithLocation.forEach(c => {
        if (!c.locationText) return;
        
        // Regex to extract Lat/Long. Supports:
        // 1. "Lat: 12.34, Long: 56.78" (Web App)
        // 2. "12.34, 56.78" (Mobile App fallback)
        // 3. "City | Lat: 12.34, Long: 56.78"
        let lat: number | null = null;
        let lng: number | null = null;

        // Try standard "Lat: ..., Long: ..." format first
        const matchStandard = c.locationText.match(/Lat:\s*(-?\d+(\.\d+)?),\s*Long:\s*(-?\d+(\.\d+)?)/i);
        if (matchStandard) {
            lat = parseFloat(matchStandard[1]);
            lng = parseFloat(matchStandard[3]);
        } else {
            // Try simple coordinate pair "12.34, 56.78" (must be 2 numbers separated by comma)
            // Avoid matching addresses like "Shop 12, Sector 45" by ensuring decimal points or high precision? 
            // Better to be strict: ^\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*$
            // Or look for it within string?
            const matchSimple = c.locationText.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
            if (matchSimple) {
                // Heuristic: valid lat is -90 to 90, lng -180 to 180
                const l = parseFloat(matchSimple[1]);
                const g = parseFloat(matchSimple[2]);
                if (Math.abs(l) <= 90 && Math.abs(g) <= 180) {
                    lat = l;
                    lng = g;
                }
            }
        }

        if (lat !== null && lng !== null) {
            // Group by coordinates rounded to 4 decimal places to aggregate nearby points
            const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
            locationMap.set(key, (locationMap.get(key) || 0) + 1);
        }
    });

    const heatmapData = Array.from(locationMap.entries()).map(([key, count]) => {
        const [lat, lng] = key.split(',').map(Number);
        return {
            lat,
            lng,
            weight: count
        };
    });

    return { row1, row2, row3, row4, barData, rtoDensity, heatmapData };
  }
}
