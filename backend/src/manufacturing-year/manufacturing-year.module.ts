import { Module } from '@nestjs/common';
import { ManufacturingYearService } from './manufacturing-year.service';
import { ManufacturingYearController } from './manufacturing-year.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ManufacturingYearController],
  providers: [ManufacturingYearService],
  exports: [ManufacturingYearService],
})
export class ManufacturingYearModule {}
