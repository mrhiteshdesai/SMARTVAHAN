import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { SldOemsService } from './sld-oems.service';
import { SldModelsService } from './sld-models.service';

@Controller('api/sld/oems')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SldOemsController {
  constructor(
    private readonly sldOemsService: SldOemsService,
    private readonly sldModelsService: SldModelsService,
  ) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SLD_ADMIN,
    UserRole.STATE_ADMIN,
    UserRole.SUB_ADMIN,
    UserRole.DEALER_USER,
  )
  findAll(@Req() req: any) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    if (isDealer) {
      return this.sldOemsService.findAll({ dealerId: req.user.userId });
    }
    if (req.user?.role === UserRole.SLD_ADMIN) {
      return this.sldOemsService.findAll({ userId: req.user.userId });
    }
    return this.sldOemsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.SUB_ADMIN)
  findOne(@Param('id') id: string) {
    return this.sldOemsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() body: any, @Req() req: any) {
    return this.sldOemsService.create(body, req.user?.userId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.sldOemsService.update(id, body, req.user?.userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.sldOemsService.remove(id, req.user?.userId);
  }

  @Post(':id/import-variant-list')
  @Roles(UserRole.SUPER_ADMIN)
  importVariantList(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.sldModelsService.importVariantList(id, body?.rows || [], req.user?.userId);
  }
}
