import { Controller, Get, Post, Body, UseGuards, Query, Req, BadRequestException } from '@nestjs/common';
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getStats(
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inventoryService.getStats({ stateCode, oemCode, startDate, endDate });
  }

  @Get('logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async getLogs(
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inventoryService.getLogs({ stateCode, oemCode, startDate, endDate });
  }

  @Post('outward')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN')
  async createOutward(@Body() data: any, @Req() req: any) {
    if (!data.stateCode || !data.oemCode || !data.productCode || !data.quantity) {
        throw new BadRequestException('Missing required fields');
    }
    return this.inventoryService.createOutward(data, req.user.id);
  }
}
