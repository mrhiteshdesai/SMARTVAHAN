import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DealersService } from '../dealers/dealers.service';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma.service';

@Controller('api/public')
export class PublicController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly dealersService: DealersService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('home')
  getHome() {
    return this.settingsService.getHomePagePublic();
  }

  @Public()
  @Post('contact')
  submitContact(@Body() body: any) {
    return this.settingsService.submitContact(body);
  }

  @Public()
  @Post('dealer-registration')
  submitDealerRegistration(@Body() body: any) {
    return this.dealersService.submitRegistrationRequest(body);
  }

  @Public()
  @Get('rtos')
  async listRtos(@Query('stateCode') stateCode?: string) {
    const normalizedStateCode = stateCode ? stateCode.trim().toUpperCase() : '';
    const where = normalizedStateCode ? { stateCode: normalizedStateCode } : undefined;
    return this.prisma.rTO.findMany({
      where: where as any,
      select: { code: true, name: true, stateCode: true },
      orderBy: { code: 'asc' },
    });
  }
}
