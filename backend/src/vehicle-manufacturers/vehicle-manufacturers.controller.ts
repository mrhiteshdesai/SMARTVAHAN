import { Controller, Get } from '@nestjs/common';
import { VehicleManufacturersService } from './vehicle-manufacturers.service';

@Controller('api/vehicle-manufacturers')
export class VehicleManufacturersController {
  constructor(private readonly service: VehicleManufacturersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}

