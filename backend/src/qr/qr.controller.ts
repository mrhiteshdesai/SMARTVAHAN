import { Controller, Post, Body, Get, UseGuards, Req, Param, Res, BadRequestException, Query, ForbiddenException } from '@nestjs/common';
import { QrService } from './qr.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import * as fs from 'fs';
import { pipeline } from 'stream';

@Controller('api/qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN, UserRole.GHOST_ADMIN) // Admin cannot generate
  async generateBatch(@Body() body: any, @Req() req: any) {
    // In a real app, extract userId from request. For now, trust the body or use a default
    const userId = req.user?.userId || body.userId || 'system-admin';
    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.qrService.generateBatch(body, userId, baseUrl);
  }

  @Post('regenerate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async regenerateBatch(@Body() body: any, @Req() req: any) {
      // Body: stateCode, oemCode, productCode, startSerial, quantity
      const userId = req.user?.userId || 'system-admin';
      const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
      return this.qrService.regenerateBatch(body, userId, baseUrl);
  }

  @Post('regenerate-v2/eligible')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async eligibleForRegenerationV2(@Body() body: any) {
    return this.qrService.getEligibleCountForRegenerationV2(body);
  }

  @Post('regenerate-v2')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async regenerateBatchV2(@Body() body: any, @Req() req: any) {
    const userId = req.user?.userId || 'system-admin';
    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.qrService.regenerateBatchV2(body, userId, baseUrl);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async reactivateQr(@Body() body: { stateCode: string; oemCode: string; serialNumber: number }, @Req() req: any) {
      if (!body.stateCode || !body.oemCode || !body.serialNumber) {
          throw new BadRequestException('Missing required fields: stateCode, oemCode, serialNumber');
      }
      const userId = req.user?.userId || 'system-admin';
      
      const isGhost = req.headers['x-ghost-mode'] === 'true';
      if (!isGhost) {
        throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
      }
      return this.qrService.reactivateQr(body, userId, true);
  }

  @Post('ghost-v1/deactivate-duplicates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async deactivateGhostV1Duplicates(@Body() body: any, @Req() req: any) {
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.deactivateGhostV1Duplicates(body, userId);
  }

  @Post('ghost-v1/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async restoreGhostQr(@Body() body: { qrValue?: string; qrCodeId?: string }, @Req() req: any) {
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.restoreGhostQr(body, userId);
  }

  @Get('ghost-v1/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async ghostV1Stats(
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('productCode') productCode?: string
  ) {
    return this.qrService.getGhostV1Stats({ stateCode, oemCode, productCode });
  }

  @Post('ghost-v1/batch/backup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async backupGhostV1Batch(@Body() body: { batchId: string }) {
    return this.qrService.backupGhostV1Batch(body);
  }

  @Post('ghost-v1/batch/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async deleteGhostV1Batch(@Body() body: { batchId: string }, @Req() req: any) {
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.deleteGhostV1Batch(body, userId);
  }

  @Post('ghost-v1/batch/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async restoreGhostV1Batch(
    @Body() body: { backup: any; onConflict?: 'FAIL' | 'SKIP'; forceNewBatchId?: boolean },
    @Req() req: any
  ) {
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.restoreGhostV1Batch(body, userId);
  }

  @Post('ghost-v1/batch/deactivate-unused')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async deactivateGhostV1BatchUnused(@Body() body: { batchId: string }, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.deactivateGhostV1BatchUnused(body, userId);
  }

  @Post('ghost-v1/batch/reactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async reactivateGhostV1Batch(@Body() body: { batchId: string }, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.reactivateGhostV1Batch(body, userId);
  }

  @Get('ghost-v2/runs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async listGhostV2Runs(
    @Req() req: any,
    @Query('stateCode') stateCode?: string,
    @Query('oemCode') oemCode?: string,
    @Query('productCode') productCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    return this.qrService.listGhostV2Runs({
      stateCode,
      oemCode,
      productCode,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  }

  @Get('ghost-v2/runs/:runId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async getGhostV2Run(@Param('runId') runId: string, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    return this.qrService.getGhostV2Run(runId);
  }

  @Get('ghost-v2/runs/:runId/counts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async getGhostV2RunCounts(@Param('runId') runId: string, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    return this.qrService.getGhostV2RunStatusCounts(runId);
  }

  @Post('ghost-v2/runs/:runId/deactivate-unused')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async deactivateGhostV2RunUnused(@Param('runId') runId: string, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.deactivateGhostV2RunUnused(runId, userId);
  }

  @Post('ghost-v2/runs/:runId/reactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async reactivateGhostV2Run(@Param('runId') runId: string, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    const userId = req.user?.userId || 'system-admin';
    return this.qrService.reactivateGhostV2Run(runId, userId);
  }

  @Get('ghost-v2/runs/:runId/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GHOST_ADMIN)
  async downloadGhostV2Run(@Param('runId') runId: string, @Res() res: Response, @Req() req: any) {
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (!isGhost) throw new ForbiddenException('This endpoint is restricted to Ghost Mode only.');
    const download = await this.qrService.getGhostV2RunDownload(runId);
    if (download.type === 'redirect') {
      res.redirect(download.url);
      return;
    }
    if (download.type === 'stream') {
      res.setHeader('Content-Type', download.contentType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
      if (typeof download.contentLength === 'number') {
        res.setHeader('Content-Length', String(download.contentLength));
      }
      await new Promise<void>((resolve, reject) => {
        pipeline(download.stream, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return;
    }
    res.download(download.path, download.filename);
  }

  @Get('batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN, UserRole.GHOST_ADMIN)
  async getBatches(@Req() req: any) {
      // Check for ghost mode header
      const isGhost = req.headers['x-ghost-mode'] === 'true';
      if (isGhost && req.user.role !== 'GHOST_ADMIN') {
        throw new ForbiddenException('Ghost Mode is restricted to Ghost Admin only.');
      }
      return this.qrService.getBatches(req.user, isGhost);
  }

  @Get('download/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STATE_ADMIN, UserRole.OEM_ADMIN, UserRole.GHOST_ADMIN)
  async downloadBatch(@Param('batchId') batchId: string, @Res() res: Response, @Req() req: any) {
      const isGhost = req.headers['x-ghost-mode'] === 'true';
      if (isGhost && req.user.role !== 'GHOST_ADMIN') {
        throw new ForbiddenException('Ghost Mode is restricted to Ghost Admin only.');
      }
      const download = await this.qrService.getBatchDownload(batchId, req.user);

      if (download.type === 'local') {
        res.download(download.path, download.filename);
        return;
      }

      if (download.type === 'redirect') {
        res.redirect(download.url);
        return;
      }

      res.setHeader('Content-Type', download.contentType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
      if (typeof download.contentLength === 'number') {
        res.setHeader('Content-Length', String(download.contentLength));
      }

      await new Promise<void>((resolve, reject) => {
        pipeline(download.stream, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
  }
}
