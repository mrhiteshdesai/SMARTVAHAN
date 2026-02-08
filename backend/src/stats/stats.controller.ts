import { Controller, Get, Query, UseGuards, Logger, InternalServerErrorException, Req } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/stats')
export class StatsController {
  private readonly logger = new Logger(StatsController.name);

  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'SUB_ADMIN', 'DEALER_USER')
  async getDashboardStats(
    @Req() req: any,
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    let finalStateCode = stateCode;
    let finalOemCode = oemCode;
    let dealerId: string | undefined = undefined;

    // Check for ghost mode header
    const isGhost = req.headers['x-ghost-mode'] === 'true';

    // Restrict Ghost Mode to SUPER_ADMIN only
    if (isGhost && user.role !== 'SUPER_ADMIN') {
        throw new InternalServerErrorException("Access Denied: Ghost Mode is restricted to Super Admins.");
    }

    if (user.role === 'STATE_ADMIN') {
        finalStateCode = user.stateCode;
    } else if (user.role === 'OEM_ADMIN') {
        finalOemCode = user.oemCode;
    } else if (user.role === 'DEALER_USER') {
        dealerId = user.userId;
    }

    try {
        this.logger.log(`Dashboard stats requested: ${JSON.stringify({ stateCode: finalStateCode, oemCode: finalOemCode, dealerId, startDate, endDate, isGhost })}`);
        return await this.statsService.getDashboardStats({ stateCode: finalStateCode, oemCode: finalOemCode, dealerId, startDate, endDate, isGhost });
    } catch (error) {
        this.logger.error('Failed to get dashboard stats', error.stack);
        throw new InternalServerErrorException(error.message);
    }
  }

  @Get('dealer/daily')
  @UseGuards(JwtAuthGuard)
  async getDealerDailyStats(
    @Query('dealerId') dealerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!dealerId) {
      throw new InternalServerErrorException('Dealer ID is required');
    }
    return this.statsService.getDealerDailyStats(dealerId, startDate, endDate);
  }
}
