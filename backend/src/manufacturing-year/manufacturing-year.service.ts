import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ManufacturingYearService implements OnModuleInit {
  private readonly logger = new Logger(ManufacturingYearService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.initializeYears();
  }

  async initializeYears() {
    const count = await this.prisma.manufacturingYear.count();
    if (count === 0) {
      this.logger.log('Initializing manufacturing years from 1965...');
      const currentYear = new Date().getFullYear();
      const years = [];
      for (let year = 1965; year <= currentYear; year++) {
        years.push({ year });
      }
      await this.prisma.manufacturingYear.createMany({
        data: years,
        skipDuplicates: true,
      });
      this.logger.log(`Initialized ${years.length} years.`);
    } else {
        // Ensure current year exists even if table is not empty
        await this.checkAndAddCurrentYear();
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Checking for new year...');
    await this.checkAndAddCurrentYear();
  }

  async checkAndAddCurrentYear() {
    const currentYear = new Date().getFullYear();
    const exists = await this.prisma.manufacturingYear.findUnique({
      where: { year: currentYear },
    });

    if (!exists) {
      await this.prisma.manufacturingYear.create({
        data: { year: currentYear },
      });
      this.logger.log(`Added new year: ${currentYear}`);
    }
  }

  async findAll() {
    return this.prisma.manufacturingYear.findMany({
      orderBy: { year: 'desc' },
    });
  }
}
