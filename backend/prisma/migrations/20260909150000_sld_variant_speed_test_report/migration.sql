-- Device model: SLD type (FUEL / CABLE)
ALTER TABLE "sld_device_models" ADD COLUMN IF NOT EXISTS "sldType" TEXT;

-- Approved vehicle variants: set speed + test report
ALTER TABLE "sld_approved_vehicle_models" ADD COLUMN IF NOT EXISTS "setSpeedKmph" INTEGER;
ALTER TABLE "sld_approved_vehicle_models" ADD COLUMN IF NOT EXISTS "testReportNo" TEXT;

UPDATE "sld_approved_vehicle_models" SET "make" = COALESCE("make", '');
UPDATE "sld_approved_vehicle_models" SET "setSpeedKmph" = 0 WHERE "setSpeedKmph" IS NULL;
UPDATE "sld_approved_vehicle_models" SET "testReportNo" = COALESCE("testReportNo", '');

ALTER TABLE "sld_approved_vehicle_models" ALTER COLUMN "make" SET DEFAULT '';
ALTER TABLE "sld_approved_vehicle_models" ALTER COLUMN "make" SET NOT NULL;
ALTER TABLE "sld_approved_vehicle_models" ALTER COLUMN "setSpeedKmph" SET NOT NULL;
ALTER TABLE "sld_approved_vehicle_models" ALTER COLUMN "testReportNo" SET DEFAULT '';
ALTER TABLE "sld_approved_vehicle_models" ALTER COLUMN "testReportNo" SET NOT NULL;

DROP INDEX IF EXISTS "sld_approved_vehicle_models_sldDeviceModelId_make_modelName_key";

CREATE UNIQUE INDEX IF NOT EXISTS "sld_approved_vehicle_models_sldDeviceModelId_make_modelName_setSpeedKmph_testReportNo_key"
ON "sld_approved_vehicle_models"("sldDeviceModelId", "make", "modelName", "setSpeedKmph", "testReportNo");

-- Certificate snapshots
ALTER TABLE "sld_certificates" ADD COLUMN IF NOT EXISTS "setSpeedKmph" INTEGER;
ALTER TABLE "sld_certificates" ADD COLUMN IF NOT EXISTS "testReportNo" TEXT;
