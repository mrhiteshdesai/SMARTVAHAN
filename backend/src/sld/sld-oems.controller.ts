import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { SldOemsService } from './sld-oems.service';

@Controller('api/sld/oems')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SldOemsController {
  constructor(private readonly sldOemsService: SldOemsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.SUB_ADMIN)
  findAll() {
    return this.sldOemsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.SUB_ADMIN)
  findOne(@Param('id') id: string) {
    return this.sldOemsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() body: any, @Req() req: any) {
    return this.sldOemsService.create(body, req.user?.userId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.sldOemsService.update(id, body, req.user?.userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.sldOemsService.remove(id, req.user?.userId);
  }
}
