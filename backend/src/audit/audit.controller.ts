import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search = ''
  ) {
    return this.auditService.getLogs(Number(page), Number(limit), search);
  }
}
