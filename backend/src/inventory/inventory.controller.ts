import { Controller, Get, Post, Delete, Param, Body, UseGuards, Query, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'SUB_ADMIN', 'GHOST_ADMIN')
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

    // Check for ghost mode header
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (isGhost && user.role !== 'SUPER_ADMIN' && user.role !== 'GHOST_ADMIN') {
        throw new ForbiddenException("Access Denied: Ghost Mode is restricted to Super Admins.");
    }

    if (user.role === 'STATE_ADMIN') finalStateCode = user.stateCode;
    if (user.role === 'OEM_ADMIN') finalOemCode = user.oemCode;

    return this.inventoryService.getStats({ stateCode: finalStateCode, oemCode: finalOemCode, startDate, endDate, isGhost });
  }

  @Get('logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'SUB_ADMIN', 'GHOST_ADMIN')
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

    // Check for ghost mode header
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (isGhost && user.role !== 'SUPER_ADMIN' && user.role !== 'GHOST_ADMIN') {
        throw new ForbiddenException("Access Denied: Ghost Mode is restricted to Super Admins.");
    }
    // For Ghost Mode, we currently return EMPTY logs because InventoryLogs (Manual) are not part of Ghost System yet.
    // Or we can just let it return empty if we implement filtering in service (which we didn't for getLogs yet).
    // Let's handle it here: if Ghost Mode, return empty array?
    // User said: "Ghost dashboard Stats, Reports, Inventory only shows certificate generated after the 1st code that is count 0"
    // Inventory Logs are Manual. So for Ghost, this table should be empty or only show Ghost-related manual logs (which don't exist).
    if (isGhost) {
        return []; // Ghost Dashboard has no Manual Inventory Logs for now.
    }

    if (user.role === 'STATE_ADMIN') finalStateCode = user.stateCode;
    if (user.role === 'OEM_ADMIN') finalOemCode = user.oemCode;
    // DEALER_USER restriction handled in Service or assumed filtered out by UI/Guard?
    // Based on previous turn, DEALER has no access to this route via Sidebar, but let's be safe.
    // Actually the Roles decorator above allows SUPER_ADMIN...SUB_ADMIN. DEALER_USER is NOT in the list.
    // So Dealer cannot access this endpoint. Good.

    return this.inventoryService.getLogs({ stateCode: finalStateCode, oemCode: finalOemCode, dealerId, startDate, endDate });
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  async deleteOutward(@Param('id') id: string) {
    return this.inventoryService.deleteLog(id);
  }

  @Delete('log/:id')
  @Roles('SUPER_ADMIN')
  async deleteLog(@Param('id') id: string) {
    return this.inventoryService.deleteLog(id);
  }

  @Post('log/:id')
  @Roles('SUPER_ADMIN')
  async updateLog(@Param('id') id: string, @Body() body: any) {
    return this.inventoryService.updateLog(id, body);
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
