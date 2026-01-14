import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OemsService } from './oems.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/oems')
export class OemsController {
  constructor(private readonly oemsService: OemsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: './uploads/oems',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      }
    })
  }))
  create(@Body() createOemDto: any, @UploadedFile() file?: any) {
    if (file) {
      createOemDto.logo = `/uploads/oems/${file.filename}`;
    }
    
    // Parse authorizedStates if it's a string (FormData)
    if (typeof createOemDto.authorizedStates === 'string') {
        try {
            createOemDto.authorizedStates = JSON.parse(createOemDto.authorizedStates);
        } catch (e) {
            // If simple comma separated or single value
            createOemDto.authorizedStates = [createOemDto.authorizedStates];
        }
    }
    
    return this.oemsService.create(createOemDto);
  }

  @Get()
  findAll() {
    return this.oemsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.oemsService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: './uploads/oems',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      }
    })
  }))
  update(@Param('id') id: string, @Body() updateOemDto: any, @UploadedFile() file?: any) {
    if (file) {
      updateOemDto.logo = `/uploads/oems/${file.filename}`;
    }
    
    // Parse authorizedStates if it's a string (FormData)
    if (typeof updateOemDto.authorizedStates === 'string') {
        try {
            updateOemDto.authorizedStates = JSON.parse(updateOemDto.authorizedStates);
        } catch (e) {
            updateOemDto.authorizedStates = [updateOemDto.authorizedStates];
        }
    }

    return this.oemsService.update(id, updateOemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.oemsService.remove(id);
  }
}
