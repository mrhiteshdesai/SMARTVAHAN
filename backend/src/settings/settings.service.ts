
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.systemSettings.findUnique({
      where: { id: 'SYSTEM_SETTINGS' },
    });

    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          id: 'SYSTEM_SETTINGS',
        },
      });
    }

    return settings;
  }

  async updateSettings(data: any) {
    return this.prisma.systemSettings.upsert({
      where: { id: 'SYSTEM_SETTINGS' },
      update: data,
      create: {
        id: 'SYSTEM_SETTINGS',
        ...data,
      },
    });
  }

  async getHomePagePublic() {
    let homePageContent: any = null;
    try {
      const settings = await this.getSettings();
      homePageContent = (settings as any).homePageContent || null;
    } catch {
      homePageContent = null;
    }

    let states: Array<{ code: string; name: string }> = [];
    let oems: Array<{ code: string; name: string; logo: string | null }> = [];
    let registrationOems: Array<{ code: string; name: string; authorizedStates: string[] }> = [];
    let totalQrCodeIssued = 0;
    let totalCertificateGenerated = 0;
    let totalVehicleFitments = 0;
    let totalStatesServed = 0;
    let totalRtosServed = 0;

    try {
      [states, oems, registrationOems] = await Promise.all([
        this.prisma.state.findMany({
          where: { showOnHomepage: true } as any,
          select: { code: true, name: true }
        }),
        this.prisma.oEM.findMany({
          where: { showOnHomepage: true } as any,
          select: { code: true, name: true, logo: true }
        }),
        this.prisma.oEM.findMany({
          select: { code: true, name: true, authorizedStates: true }
        })
      ]);

      const [qrCount, certCount, uniqueVehicleNumbers, stateCount, rtoCount] = await Promise.all([
        this.prisma.qRCode.count({ where: { batch: { isGhost: false } } }),
        this.prisma.certificate.count({ where: { NOT: { count: 0 } } }),
        this.prisma.certificate.groupBy({
          by: ['vehicleNumber'],
          where: { NOT: { count: 0 } },
          _count: { _all: true }
        }),
        this.prisma.state.count(),
        this.prisma.rTO.count()
      ]);

      totalQrCodeIssued = qrCount;
      totalCertificateGenerated = certCount;
      totalVehicleFitments = uniqueVehicleNumbers.length;
      totalStatesServed = stateCount;
      totalRtosServed = rtoCount;
    } catch {
    }

    return {
      success: true,
      data: {
        content: homePageContent,
        states,
        oems,
        registrationOems,
        stats: {
          totalQrCodeIssued,
          totalCertificateGenerated,
          totalVehicleFitments,
          totalStatesServed,
          totalRtosServed
        }
      }
    };
  }

  async submitContact(data: { name?: string; email?: string; phone?: string; message?: string }) {
    const name = (data.name || '').trim();
    const email = (data.email || '').trim();
    const phone = (data.phone || '').trim();
    const message = (data.message || '').trim();

    if (!name) throw new BadRequestException('Name is required');
    if (!message) throw new BadRequestException('Message is required');
    if (!email && !phone) throw new BadRequestException('Email or phone is required');

    const created = await (this.prisma as any).contactSubmission.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        message
      }
    });

    return { success: true, data: { id: created.id } };
  }
}
