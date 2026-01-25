import { Controller, Get, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('state')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN')
  async getStateReport(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    if (user.role === 'OEM_ADMIN') throw new ForbiddenException('Access denied');
    
    // For STATE_ADMIN, we can filter by their state if needed, but this report is usually "All States" or "Specific State".
    // If STATE_ADMIN calls this, it probably returns their state's data only?
    // ReportService.getStateReport takes filters.
    // Actually, State Report usually lists ALL States. 
    // STATE_ADMIN shouldn't see other states?
    // If so, we should pass stateCode.
    
    let stateCode = undefined;
    if (user.role === 'STATE_ADMIN') stateCode = user.stateCode;

    // Wait, reportsService.getStateReport logic:
    // "SELECT s.name as "State Name", ..."
    // It filters by stateCode if provided.
    // So enforcing stateCode restricts it to 1 row (Their State). Correct.
    
    return this.reportsService.getStateReport({ stateCode, startDate, endDate });
  }

  @Get('rto')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN')
  async getRtoReport(
    @Req() req: any,
    @Query('stateCode') stateCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    if (user.role === 'OEM_ADMIN') throw new ForbiddenException('Access denied');

    let finalStateCode = stateCode;
    if (user.role === 'STATE_ADMIN') finalStateCode = user.stateCode;

    return this.reportsService.getRtoReport({ stateCode: finalStateCode, startDate, endDate });
  }

  @Get('oem')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN')
  async getOemReport(
    @Req() req: any,
    @Query('stateCode') stateCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    if (user.role === 'OEM_ADMIN') throw new ForbiddenException('Access denied');

    let finalStateCode = stateCode;
    if (user.role === 'STATE_ADMIN') finalStateCode = user.stateCode;

    return this.reportsService.getOemReport({ stateCode: finalStateCode, startDate, endDate });
  }

  @Get('dealer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getDealerReport(
    @Req() req: any,
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    let finalStateCode = stateCode;
    let finalOemCode = oemCode;

    if (user.role === 'STATE_ADMIN') finalStateCode = user.stateCode;
    if (user.role === 'OEM_ADMIN') finalOemCode = user.oemCode;

    return this.reportsService.getDealerReport({ stateCode: finalStateCode, oemCode: finalOemCode, startDate, endDate });
  }
}
