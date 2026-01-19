import { Controller, Post, Body, Get, UseGuards, Req, Param, Res } from '@nestjs/common';
import { QrService } from './qr.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN) // Admin cannot generate
  async generateBatch(@Body() body: any, @Req() req: any) {
    // In a real app, extract userId from request. For now, trust the body or use a default
    const userId = body.userId || 'system-admin';
    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.qrService.generateBatch(body, userId, baseUrl);
  }

  @Post('reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivateQr(@Body() body: { stateCode: string; oemCode: string; serialNumber: number }) {
      if (!body.stateCode || !body.oemCode || !body.serialNumber) {
          throw new Error('Missing required fields: stateCode, oemCode, serialNumber');
      }
      return this.qrService.reactivateQr(body);
  }

  @Get('batches')
  @UseGuards(JwtAuthGuard)
  async getBatches() {
      return this.qrService.getBatches();
  }

  @Get('download/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async downloadBatch(@Param('batchId') batchId: string, @Res() res: Response) {
      const file = await this.qrService.getBatchFile(batchId);
      if (file.isUrl) {
          res.redirect(file.path);
      } else {
          res.download(file.path, file.filename);
      }
  }
}
