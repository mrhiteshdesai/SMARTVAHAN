
import { Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile, Req, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN) // Only Super Admin can view/edit settings
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  updateSettings(@Body() data: any) {
    return this.settingsService.updateSettings(data);
  }

  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: './uploads/system',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      }
    })
  }))
  async uploadLogo(@UploadedFile() file: any) {
    const logoPath = `/uploads/system/${file.filename}`;
    return this.settingsService.updateSettings({ systemLogo: logoPath });
  }

  /**
   * Upload a dealer/scanner APK for in-app update rollout.
   * Returns a public path + absolute URL suitable for Mobile App Config storeUrl.
   */
  @Post('mobile-apk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('apk', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = './uploads/mobile/apps';
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const safeBase = String(file.originalname || 'app')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/\.apk$/i, '');
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${safeBase}-${uniqueSuffix}.apk`);
        },
      }),
      limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
      fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        const ok =
          name.endsWith('.apk') ||
          file.mimetype === 'application/vnd.android.package-archive' ||
          file.mimetype === 'application/octet-stream';
        if (!ok) {
          return cb(new BadRequestException('Only .apk files are allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadMobileApk(@UploadedFile() file: any, @Req() req: any) {
    if (!file?.filename) {
      throw new BadRequestException('APK file is required');
    }
    const path = `/uploads/mobile/apps/${file.filename}`;
    const base =
      (process.env.BASE_URL || process.env.FRONTEND_URL || '').trim().replace(/\/$/, '') ||
      `${req.protocol}://${req.get('host')}`;
    // Prefer public site origin for downloads (IIS often serves /uploads from same host)
    const absoluteUrl = `${base}${path}`;

    // Optionally stamp into defaultStoreUrl so Save is one step less — caller still saves config
    return {
      success: true,
      path,
      url: absoluteUrl,
      filename: file.filename,
      size: file.size,
      message: 'APK uploaded. Use the returned URL as Store / APK URL (and Save Settings).',
    };
  }
}
