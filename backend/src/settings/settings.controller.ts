
import { Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  updateSettings(@Body() data: any) {
    return this.settingsService.updateSettings(data);
  }

  @Post('logo')
  @UseGuards(JwtAuthGuard)
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
}
