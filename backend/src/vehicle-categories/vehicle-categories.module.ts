import { Module } from '@nestjs/common';
import { VehicleCategoriesService } from './vehicle-categories.service';
import { VehicleCategoriesController } from './vehicle-categories.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VehicleCategoriesController],
  providers: [VehicleCategoriesService],
  exports: [VehicleCategoriesService],
})
export class VehicleCategoriesModule {}
