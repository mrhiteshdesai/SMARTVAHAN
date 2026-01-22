import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, resolve } from 'path';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/roles.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { StatesModule } from "./states/states.module";
import { RtosModule } from "./rtos/rtos.module";
import { OemsModule } from "./oems/oems.module";
import { DealersModule } from "./dealers/dealers.module";
import { ProductsModule } from "./products/products.module";
import { QrModule } from "./qr/qr.module";
import { ManufacturingYearModule } from "./manufacturing-year/manufacturing-year.module";
import { CertificatesModule } from "./certificates/certificates.module";
import { VehicleCategoriesModule } from "./vehicle-categories/vehicle-categories.module";
import { VehicleManufacturersModule } from "./vehicle-manufacturers/vehicle-manufacturers.module";
import { SettingsModule } from "./settings/settings.module";
import { StatsModule } from "./stats/stats.module";
import { S3Module } from "./s3/s3.module";
import { AuditModule } from "./audit/audit.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ReportsModule } from "./reports/reports.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: resolve(process.env.UPLOADS_DIR ?? join(__dirname, '..', '..', 'uploads')),
      serveRoot: '/uploads',
    }),
    S3Module,
    AuthModule,
    UsersModule,
    StatesModule,
    RtosModule,
    OemsModule,
    DealersModule,
    ProductsModule,
    QrModule,
    ManufacturingYearModule,
    CertificatesModule,
    VehicleCategoriesModule,
    VehicleManufacturersModule,
    SettingsModule,
    StatsModule,
    AuditModule,
    InventoryModule,
    ReportsModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
