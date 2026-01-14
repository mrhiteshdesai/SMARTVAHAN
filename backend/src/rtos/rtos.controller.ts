import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { RtosService } from './rtos.service';

@Controller('api/rtos')
export class RtosController {
  constructor(private readonly rtosService: RtosService) {}

  @Post()
  create(@Body() createRtoDto: any) {
    return this.rtosService.create(createRtoDto);
  }

  @Get()
  findAll(@Query('stateCode') stateCode?: string) {
    return this.rtosService.findAll(stateCode);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rtosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRtoDto: any) {
    return this.rtosService.update(id, updateRtoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rtosService.remove(id);
  }
}
