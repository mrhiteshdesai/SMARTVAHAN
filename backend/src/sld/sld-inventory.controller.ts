import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { SldInventoryService } from './sld-inventory.service';

@Controller('api/sld/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SldInventoryController {
  constructor(private readonly inventoryService: SldInventoryService) {}

  @Post('upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  upload(@Body() body: any, @Req() req: any) {
    return this.inventoryService.uploadInventory(body, req.user?.userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEALER_USER)
  list(
    @Req() req: any,
    @Query('sldOemId') sldOemId?: string,
    @Query('modelId') modelId?: string,
    @Query('status') status?: string,
    @Query('dealerId') dealerId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    return this.inventoryService.listInventory({
      sldOemId,
      modelId,
      status,
      // Dealers only see their own assigned inventory
      dealerId: isDealer ? req.user.userId : dealerId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('available')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  available(@Query('sldOemId') sldOemId: string, @Query('modelId') modelId: string) {
    return this.inventoryService.listAvailableForAssign(sldOemId, modelId);
  }

  @Get('forward-targets')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEALER_USER)
  forwardTargets(@Req() req: any, @Query('sldOemId') sldOemId: string) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    const exclude = isDealer ? req.user.userId : undefined;
    return this.inventoryService.listForwardTargets(sldOemId, exclude);
  }

  @Get('assigned-for-forward')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEALER_USER)
  assignedForForward(
    @Req() req: any,
    @Query('sldOemId') sldOemId: string,
    @Query('dealerId') dealerId?: string,
  ) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    return this.inventoryService.listAssignedForForward(
      sldOemId,
      isDealer ? req.user.userId : dealerId || undefined,
    );
  }

  @Post('assign')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  assign(@Body() body: any, @Req() req: any) {
    return this.inventoryService.assignManual(body, req.user?.userId);
  }

  @Post('assign-csv')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  assignCsv(@Body() body: any, @Req() req: any) {
    return this.inventoryService.assignCsv(body, req.user?.userId);
  }

  /** Dealer → dealer reassignment of ASSIGNED (unused) serials (manual IDs or CSV). */
  @Post('forward')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEALER_USER)
  forward(@Body() body: any, @Req() req: any) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    const fromDealerId = isDealer
      ? req.user.userId
      : String(body?.fromDealerId || '').trim() || undefined;
    return this.inventoryService.forwardSerials(body, fromDealerId, req.user?.userId);
  }
}
