import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DealersService } from './dealers.service';

@Controller('api/dealers')
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  @Post()
  create(@Body() createDealerDto: any) {
    return this.dealersService.create(createDealerDto);
  }

  @Get()
  findAll() {
    return this.dealersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dealersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDealerDto: any) {
    return this.dealersService.update(id, updateDealerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dealersService.remove(id);
  }
}
