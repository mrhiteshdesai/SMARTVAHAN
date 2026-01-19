import { Module } from '@nestjs/common';
import { VehicleManufacturersService } from './vehicle-manufacturers.service';
import { VehicleManufacturersController } from './vehicle-manufacturers.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VehicleManufacturersController],
  providers: [VehicleManufacturersService],
  exports: [VehicleManufacturersService],
})
export class VehicleManufacturersModule {}

