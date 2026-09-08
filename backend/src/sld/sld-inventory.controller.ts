import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { SldInventoryService } from './sld-inventory.service';

@Controller('api/sld/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class SldInventoryController {
  constructor(private readonly inventoryService: SldInventoryService) {}

  @Post('upload')
  upload(@Body() body: any, @Req() req: any) {
    return this.inventoryService.uploadInventory(body, req.user?.userId);
  }

  @Get()
  list(
    @Query('sldOemId') sldOemId?: string,
    @Query('modelId') modelId?: string,
    @Query('status') status?: string,
    @Query('dealerId') dealerId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listInventory({
      sldOemId,
      modelId,
      status,
      dealerId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('available')
  available(@Query('sldOemId') sldOemId: string, @Query('modelId') modelId: string) {
    return this.inventoryService.listAvailableForAssign(sldOemId, modelId);
  }

  @Post('assign')
  assign(@Body() body: any, @Req() req: any) {
    return this.inventoryService.assignManual(body, req.user?.userId);
  }

  @Post('assign-csv')
  assignCsv(@Body() body: any, @Req() req: any) {
    return this.inventoryService.assignCsv(body, req.user?.userId);
  }
}
