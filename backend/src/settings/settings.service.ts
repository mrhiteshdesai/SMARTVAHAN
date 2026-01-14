
import { Injectable } from '@nestjs/common';
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
}
