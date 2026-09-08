import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuditModule } from '../audit/audit.module';
import { S3Module } from '../s3/s3.module';
import { SettingsModule } from '../settings/settings.module';
import { SldOemsController } from './sld-oems.controller';
import { SldOemsService } from './sld-oems.service';
import { SldModelsController, SldVehicleModelsController } from './sld-models.controller';
import { SldModelsService } from './sld-models.service';
import { SldInventoryController } from './sld-inventory.controller';
import { SldInventoryService } from './sld-inventory.service';
import { SldCertificatesController } from './sld-certificates.controller';
import { SldCertificatesService } from './sld-certificates.service';

@Module({
  imports: [PrismaModule, AuditModule, S3Module, SettingsModule],
  controllers: [
    SldOemsController,
    SldModelsController,
    SldVehicleModelsController,
    SldInventoryController,
    SldCertificatesController,
  ],
  providers: [SldOemsService, SldModelsService, SldInventoryService, SldCertificatesService],
  exports: [SldOemsService, SldModelsService, SldInventoryService, SldCertificatesService],
})
export class SldModule {}
