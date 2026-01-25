import { Controller, Get, Post, Body, UseGuards, Query, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'SUB_ADMIN')
  async getStats(
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

    return this.inventoryService.getStats({ stateCode: finalStateCode, oemCode: finalOemCode, startDate, endDate });
  }

  @Get('logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'SUB_ADMIN')
  async getLogs(
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

    if (user.role === 'STATE_ADMIN') finalStateCode = user.stateCode;
    if (user.role === 'OEM_ADMIN') finalOemCode = user.oemCode;

    return this.inventoryService.getLogs({ stateCode: finalStateCode, oemCode: finalOemCode, dealerId, startDate, endDate });
  }

  @Post('outward')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'SUB_ADMIN')
  async createOutward(@Body() data: any, @Req() req: any) {
    if (!data.stateCode || !data.oemCode || !data.productCode || !data.quantity) {
        throw new BadRequestException('Missing required fields');
    }
    const user = req.user;
    if (user.role === 'STATE_ADMIN' && data.stateCode !== user.stateCode) throw new ForbiddenException('Invalid State Code');
    if (user.role === 'OEM_ADMIN' && data.oemCode !== user.oemCode) throw new ForbiddenException('Invalid OEM Code');
    if (user.role === 'DEALER_USER' && data.stateCode !== user.stateCode) throw new ForbiddenException('Invalid State Code');

    return this.inventoryService.createOutward(data, req.user.id);
  }
}
