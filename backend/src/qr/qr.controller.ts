import { Controller, Post, Body, Get, UseGuards, Req, Param, Res } from '@nestjs/common';
import { QrService } from './qr.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('generate')
  // @UseGuards(JwtAuthGuard)
  async generateBatch(@Body() body: any, @Req() req: any) {
    // In a real app, extract userId from request. For now, trust the body or use a default
    const userId = body.userId || 'system-admin';
    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.qrService.generateBatch(body, userId, baseUrl);
  }

  @Get('batches')
  async getBatches() {
      return this.qrService.getBatches();
  }

  @Get('download/:batchId')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async downloadBatch(@Param('batchId') batchId: string, @Res() res: Response) {
      const file = await this.qrService.getBatchFile(batchId);
      res.download(file.path, file.filename);
  }
}
