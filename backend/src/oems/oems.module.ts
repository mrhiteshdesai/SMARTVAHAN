import { Module } from '@nestjs/common';
import { OemsService } from './oems.service';
import { OemsController } from './oems.controller';

@Module({
  controllers: [OemsController],
  providers: [OemsService],
})
export class OemsModule {}
