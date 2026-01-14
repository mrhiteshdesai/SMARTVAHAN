import { Module } from '@nestjs/common';
import { DealersService } from './dealers.service';
import { DealersController } from './dealers.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DealersController],
  providers: [DealersService],
  exports: [DealersService],
})
export class DealersModule {}
