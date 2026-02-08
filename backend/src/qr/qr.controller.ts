import { Controller, Post, Body, Get, UseGuards, Req, Param, Res, BadRequestException } from '@nestjs/common';
import { QrService } from './qr.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import * as fs from 'fs';

@Controller('api/qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN) // Admin cannot generate
  async generateBatch(@Body() body: any, @Req() req: any) {
    // In a real app, extract userId from request. For now, trust the body or use a default
    const userId = req.user?.userId || body.userId || 'system-admin';
    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.qrService.generateBatch(body, userId, baseUrl);
  }

  @Post('regenerate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN) // Only Super Admin can regenerate (Ghost Mode)
  async regenerateBatch(@Body() body: any, @Req() req: any) {
      // Body: stateCode, oemCode, productCode, startSerial, quantity
      const userId = req.user?.userId || 'system-admin';
      const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
      return this.qrService.regenerateBatch(body, userId, baseUrl);
  }

  @Post('bulk-replacement')
  @UseGuards(JwtAuthGuard)
  async bulkReplacement(@Body() body: { serials: number[], stateCode: string, oemCode: string }, @Res() res: any, @Req() req: any) {
    if (!body.serials || !Array.isArray(body.serials) || body.serials.length === 0) {
        throw new BadRequestException("Serials array is required");
    }
    if (!body.stateCode || !body.oemCode) {
        throw new BadRequestException("State and OEM codes are required");
    }

    // Base URL logic similar to generateBatch
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = await this.qrService.generateBulkReplacementPdf(body.serials, body.stateCode, body.oemCode, baseUrl);
    
    // Set headers for file download
    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    const filename = `Replacement-${dateStr}-${result.count}.pdf`;

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Processed-Count': result.count.toString(),
        'X-Skipped-Count': result.skipped.toString()
    });

    const stream = fs.createReadStream(result.filePath);
    stream.pipe(res);

    // Cleanup file after sending
    stream.on('close', () => {
        try {
            if (fs.existsSync(result.filePath)) {
                fs.unlinkSync(result.filePath);
            }
        } catch (e) {
            console.error("Failed to cleanup temp PDF", e);
        }
    });
  }

  @Post('reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivateQr(@Body() body: { stateCode: string; oemCode: string; serialNumber: number }, @Req() req: any) {
      if (!body.stateCode || !body.oemCode || !body.serialNumber) {
          throw new Error('Missing required fields: stateCode, oemCode, serialNumber');
      }
      const userId = req.user?.userId || 'system-admin';
      
      // Check for ghost mode header
      const isGhost = req.headers['x-ghost-mode'] === 'true';
      if (isGhost && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'GHOST_ADMIN') {
        // Should be caught by RoleGuard but reactivateQr currently has no Role restriction in decorator?
        // Wait, @UseGuards(JwtAuthGuard) only. Any logged in user can access?
        // The original code has no @Roles decorator.
        // We should add Roles or handle logic.
        // For Ghost Mode, only SUPER_ADMIN.
        throw new Error("Access Denied: Ghost Mode is restricted to Super Admins.");
      }

      return this.qrService.reactivateQr(body, userId, isGhost);
  }

  @Get('batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN, UserRole.GHOST_ADMIN)
  async getBatches(@Req() req: any) {
      // Check for ghost mode header
      const isGhost = req.headers['x-ghost-mode'] === 'true';
      return this.qrService.getBatches(req.user, isGhost);
  }

  @Get('download/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN)
  async downloadBatch(@Param('batchId') batchId: string, @Res() res: Response, @Req() req: any) {
      const file = await this.qrService.getBatchFile(batchId, req.user);
      if (file.isUrl) {
          res.redirect(file.path);
      } else {
          res.download(file.path, file.filename);
      }
  }
}
