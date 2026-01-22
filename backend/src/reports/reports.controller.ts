import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('state')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getStateReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getStateReport({ startDate, endDate });
  }

  @Get('rto')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getRtoReport(
    @Query('stateCode') stateCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getRtoReport({ stateCode, startDate, endDate });
  }

  @Get('oem')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getOemReport(
    @Query('stateCode') stateCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getOemReport({ stateCode, startDate, endDate });
  }

  @Get('dealer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getDealerReport(
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getDealerReport({ stateCode, oemCode, startDate, endDate });
  }
}
