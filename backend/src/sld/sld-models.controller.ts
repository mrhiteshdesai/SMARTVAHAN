import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { SldModelsService } from './sld-models.service';

@Controller('api/sld/models')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SldModelsController {
  constructor(private readonly sldModelsService: SldModelsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.SUB_ADMIN)
  findAll(@Query('sldOemId') sldOemId?: string) {
    return this.sldModelsService.findAll(sldOemId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.SUB_ADMIN)
  findOne(@Param('id') id: string) {
    return this.sldModelsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() body: any, @Req() req: any) {
    return this.sldModelsService.create(body, req.user?.userId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.sldModelsService.update(id, body, req.user?.userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.sldModelsService.remove(id, req.user?.userId);
  }

  @Get(':id/vehicle-models')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.SUB_ADMIN, UserRole.DEALER_USER)
  listVehicleModels(@Param('id') id: string) {
    return this.sldModelsService.listVehicleModels(id);
  }

  @Post(':id/vehicle-models/upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  uploadVehicleModels(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.sldModelsService.uploadVehicleModels(id, body?.csvText || '', req.user?.userId);
  }

  @Post(':id/vehicle-models')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createVehicleModel(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.sldModelsService.createVehicleModel(id, body, req.user?.userId);
  }
}

@Controller('api/sld/vehicle-models')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SldVehicleModelsController {
  constructor(private readonly sldModelsService: SldModelsService) {}

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.sldModelsService.deleteVehicleModel(id, req.user?.userId);
  }
}
