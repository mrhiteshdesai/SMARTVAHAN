import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class StatsService {
  private readonly products = ['CT', 'C3', 'C4', 'CTAUTO'];

  constructor(private prisma: PrismaService) {}

  async getDashboardStats(query: { stateCode?: string; oemCode?: string; dealerId?: string; startDate?: string; endDate?: string, isGhost?: boolean }) {
    const { stateCode, oemCode, dealerId, startDate, endDate, isGhost = false } = query;
    
    const dateFilter = startDate && endDate ? {
        generatedAt: {
            gte: new Date(startDate),
            lte: new Date(endDate)
        }
    } : {};

    const whereBatch = {
        ...(stateCode && { stateCode }),
        ...(oemCode && { oemCode }),
        isGhost
    };

    // Base filter for structure and permissions (Dealer/State/OEM)
    const baseCertWhere: any = {
        qrCode: {
            batch: whereBatch
        }
    };
    if (dealerId) {
        baseCertWhere.dealerId = dealerId;
    }

    // Full filter including date range (for aggregates that respect dashboard filter)
    const certWhere: any = {
        ...baseCertWhere,
        ...dateFilter
    };

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
            ...baseCertWhere
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
    this.products.forEach(p => row1[p] = 0);
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
            ...baseCertWhere
        }
    });

    // Get Sunday of current week (Start of Week)
    const todayForWeek = new Date();
    todayForWeek.setHours(0,0,0,0);
    const dayOfWeek = todayForWeek.getDay(); // 0 (Sun) to 6 (Sat)
    const diff = todayForWeek.getDate() - dayOfWeek; // Adjust to Sunday
    
    const startOfWeek = new Date(todayForWeek);
    startOfWeek.setDate(diff);

    const weekCertsCount = await this.prisma.certificate.count({
        where: {
            generatedAt: {
                gte: startOfWeek
            },
            ...baseCertWhere
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
    
    // For Total QR Used, it effectively checks certificates. 
    // If dealerId is present, we should filter by dealerId on certificate relation?
    // But QRCode logic is: where batch matches AND certificate is not null.
    // If dealerId is present, we want QRs used BY THIS DEALER.
    // So better to query Certificate count directly for 'totalQrUsed' if dealerId is present.
    // But existing logic uses QRCode count.
    
    let totalQrUsed = 0;
    if (dealerId) {
         totalQrUsed = await this.prisma.certificate.count({
             where: certWhere
         });
    } else {
        totalQrUsed = await this.prisma.qRCode.count({
            where: {
                batch: whereBatch,
                certificate: { isNot: null }
            }
        });
    }

    const totalCerts = await this.prisma.certificate.count({
        where: certWhere
    });

    // Active Dealers
    const dealerWhere: any = { status: 'ACTIVE' };
    if (stateCode) dealerWhere.stateCode = stateCode;
    if (oemCode) dealerWhere.oems = { some: { code: oemCode } };
    
    // If dealerId is provided (Dealer Role), Total Active Dealers is likely 1 (Self) or irrelevant.
    // We'll return it as is (filtered by State/OEM) but Frontend hides it.
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
    for (const p of this.products) {
        const issued = await this.prisma.qRCode.count({
            where: {
                batch: { ...whereBatch, productCode: p }
            }
        });
        const used = await this.prisma.qRCode.count({
            where: {
                batch: { ...whereBatch, productCode: p },
                certificate: { isNot: null }
            }
        });
        row4[p] = { issued, used };
    }

    // --- Charts: Bar Graph (Last 7 Days + Today) ---
    const barData: any[] = [];
    const oemBarData: any[] = []; // New: OEM Bar Data
    const todayRef = new Date();
    todayRef.setHours(0,0,0,0);
    
    // Fetch all OEMs for keys
    const allOems = await this.prisma.oEM.findMany({ select: { code: true } });
    const oemCodes = allOems.map(o => o.code);

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
                ...certWhere
            },
            include: { qrCode: { include: { batch: true } } }
        });

        // Product Bar Data
        const dayStat: any = { date: d.toISOString().split('T')[0] };
        this.products.forEach(p => dayStat[p] = 0);
        
        // OEM Bar Data
        const oemDayStat: any = { date: d.toISOString().split('T')[0] };
        oemCodes.forEach(code => oemDayStat[code] = 0);

        dayCerts.forEach(c => {
            // Product
            const p = c.qrCode.batch.productCode;
            if (dayStat[p] !== undefined) dayStat[p]++;

            // OEM
            const o = c.qrCode.batch.oemCode;
            // Initialize if not present (dynamic OEMs)
            if (oemDayStat[o] === undefined) oemDayStat[o] = 0;
            oemDayStat[o]++;
        });
        
        barData.push(dayStat);
        oemBarData.push(oemDayStat);
    }

    // --- Top Performing OEMs (Based on filtered period) ---
    // Aggregate certificates by OEM Code
    const certsForOemPerf = await this.prisma.certificate.findMany({
        where: {
            ...dateFilter,
            qrCode: { batch: whereBatch }
        },
        select: {
            qrCode: {
                select: {
                    batch: {
                        select: { oemCode: true }
                    }
                }
            }
        }
    });

    const oemPerfMap = new Map<string, number>();
    certsForOemPerf.forEach(c => {
        const code = c.qrCode.batch.oemCode;
        oemPerfMap.set(code, (oemPerfMap.get(code) || 0) + 1);
    });

    // Fetch OEM names for display
    const usedOemCodes = Array.from(oemPerfMap.keys());
    const usedOems = await this.prisma.oEM.findMany({
        where: { code: { in: usedOemCodes } },
        select: { code: true, name: true }
    });

    const oemPerformance = usedOems.map(oem => ({
        name: oem.name,
        code: oem.code,
        count: oemPerfMap.get(oem.code) || 0
    })).sort((a, b) => b.count - a.count); // Sort descending

    // --- Charts: Heatmap (Density by RTO) ---
    const rtoGroups = await this.prisma.certificate.groupBy({
        by: ['registrationRto'],
        where: certWhere,
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
             ...certWhere,
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

    return { row1, row2, row3, row4, barData, oemBarData, oemPerformance, rtoDensity, heatmapData };
  }

  async getDealerDailyStats(dealerId: string, startDate?: string, endDate?: string) {
    let start: Date;
    let end: Date;

    if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        start = today;
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        end = tomorrow;
    }

    const products = ['CT', 'C3', 'C4', 'CTAUTO'];
    const stats: Record<string, number> = {};
    products.forEach(p => stats[p] = 0);

    const certs = await this.prisma.certificate.findMany({
        where: {
            dealerId: dealerId,
            generatedAt: {
                gte: start,
                lt: end
            }
        },
        include: {
            qrCode: {
                include: {
                    batch: true
                }
            }
        }
    });

    certs.forEach(c => {
        let p = c.qrCode?.batch?.productCode;
        if (p) {
            p = p.trim();
            if (stats[p] !== undefined) {
                stats[p]++;
            } else {
                // Handle potential case mismatches
                const upperP = p.toUpperCase();
                if (stats[upperP] !== undefined) {
                    stats[upperP]++;
                }
            }
        }
    });

    return stats;
  }
}
