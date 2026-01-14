import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { StatesService } from './states.service';

@Controller('api/states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Post()
  create(@Body() createStateDto: any) {
    return this.statesService.create(createStateDto);
  }

  @Get()
  findAll() {
    return this.statesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.statesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStateDto: any) {
    return this.statesService.update(id, updateStateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.statesService.remove(id);
  }
}
