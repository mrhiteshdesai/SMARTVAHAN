import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { DealersService } from './dealers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/dealers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() createDealerDto: any, @Req() req: any) {
    const userId = req.user?.userId;
    return this.dealersService.create(createDealerDto, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll() {
    return this.dealersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.dealersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateDealerDto: any) {
    return this.dealersService.update(id, updateDealerDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.dealersService.remove(id);
  }
}
