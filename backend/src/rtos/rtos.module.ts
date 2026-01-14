import { Module } from '@nestjs/common';
import { RtosService } from './rtos.service';
import { RtosController } from './rtos.controller';

@Module({
  controllers: [RtosController],
  providers: [RtosService],
})
export class RtosModule {}
