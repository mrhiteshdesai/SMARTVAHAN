import { Controller, Get, Query, UseGuards, Logger, InternalServerErrorException } from '@nestjs/common';
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getDashboardStats(
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
        this.logger.log(`Dashboard stats requested: ${JSON.stringify({ stateCode, oemCode, startDate, endDate })}`);
        return await this.statsService.getDashboardStats({ stateCode, oemCode, startDate, endDate });
    } catch (error) {
        this.logger.error('Failed to get dashboard stats', error.stack);
        throw new InternalServerErrorException(error.message);
    }
  }
}
