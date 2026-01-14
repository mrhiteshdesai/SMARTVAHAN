import { Controller, Get } from '@nestjs/common';
import { ManufacturingYearService } from './manufacturing-year.service';

@Controller('manufacturing-years')
export class ManufacturingYearController {
  constructor(private readonly service: ManufacturingYearService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
