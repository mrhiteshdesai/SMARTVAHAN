
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { PublicController } from './public.controller';
import { SettingsService } from './settings.service';
import { PrismaModule } from '../prisma.module';
import { DealersModule } from '../dealers/dealers.module';

@Module({
  imports: [PrismaModule, DealersModule],
  controllers: [SettingsController, PublicController],
  providers: [SettingsService],
})
export class SettingsModule {}
