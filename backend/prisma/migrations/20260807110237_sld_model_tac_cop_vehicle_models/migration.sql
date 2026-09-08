-- AlterTable
ALTER TABLE "sld_certificates" ADD COLUMN     "sealNumber" TEXT;

-- AlterTable
ALTER TABLE "sld_device_models" ADD COLUMN     "copDocument" TEXT,
ADD COLUMN     "copNumber" TEXT,
ADD COLUMN     "copValidity" TIMESTAMP(3),
ADD COLUMN     "speedLimit" TEXT,
ADD COLUMN     "tacNumber" TEXT,
ADD COLUMN     "testingAgency" TEXT,
ADD COLUMN     "typeApprovalClass" TEXT;

-- CreateTable
CREATE TABLE "sld_approved_vehicle_models" (
    "id" TEXT NOT NULL,
    "sldDeviceModelId" TEXT NOT NULL,
    "make" TEXT,
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sld_approved_vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sld_approved_vehicle_models_sldDeviceModelId_idx" ON "sld_approved_vehicle_models"("sldDeviceModelId");

-- CreateIndex
CREATE UNIQUE INDEX "sld_approved_vehicle_models_sldDeviceModelId_make_modelName_key" ON "sld_approved_vehicle_models"("sldDeviceModelId", "make", "modelName");

-- AddForeignKey
ALTER TABLE "sld_approved_vehicle_models" ADD CONSTRAINT "sld_approved_vehicle_models_sldDeviceModelId_fkey" FOREIGN KEY ("sldDeviceModelId") REFERENCES "sld_device_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
