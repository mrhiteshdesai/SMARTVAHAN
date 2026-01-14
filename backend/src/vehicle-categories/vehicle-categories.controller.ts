import { Controller, Get } from '@nestjs/common';
import { VehicleCategoriesService } from './vehicle-categories.service';

@Controller('api/vehicle-categories')
export class VehicleCategoriesController {
  constructor(private readonly service: VehicleCategoriesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
