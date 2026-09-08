-- CreateEnum
CREATE TYPE "SldSerialStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'USED');

-- CreateEnum
CREATE TYPE "SldCertStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "dealer_registration_requests" ADD COLUMN     "sldOemCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "wantsReflective" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wantsSld" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sld_oems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "authorizedStates" TEXT[],
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sld_oems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sld_device_models" (
    "id" TEXT NOT NULL,
    "sldOemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sld_device_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sld_device_serials" (
    "id" TEXT NOT NULL,
    "sldOemId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "SldSerialStatus" NOT NULL DEFAULT 'AVAILABLE',
    "dealerId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sld_device_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sld_certificates" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "deviceSerialId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "sldOemId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" "SldCertStatus" NOT NULL DEFAULT 'PENDING',
    "vehicleMake" TEXT,
    "vehicleCategory" TEXT,
    "fuelType" TEXT,
    "passingRto" TEXT,
    "registrationRto" TEXT,
    "series" TEXT,
    "manufacturingYear" TEXT,
    "chassisNumber" TEXT,
    "engineNumber" TEXT,
    "ownerName" TEXT,
    "ownerContact" TEXT,
    "vehicleNumber" TEXT,
    "photoInstalled" TEXT,
    "photoSeal" TEXT,
    "photoSerial" TEXT,
    "photoPlate" TEXT,
    "smartvahanPdfPath" TEXT,
    "vahanPdfPath" TEXT,
    "vahanUploadedAt" TIMESTAMP(3),
    "vahanUploadedBy" TEXT,
    "locationText" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sld_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DealerToSldOem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DealerToSldOem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "sld_oems_code_key" ON "sld_oems"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sld_device_models_sldOemId_code_key" ON "sld_device_models"("sldOemId", "code");

-- CreateIndex
CREATE INDEX "sld_device_serials_status_dealerId_idx" ON "sld_device_serials"("status", "dealerId");

-- CreateIndex
CREATE INDEX "sld_device_serials_modelId_status_idx" ON "sld_device_serials"("modelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sld_device_serials_sldOemId_serialNumber_key" ON "sld_device_serials"("sldOemId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sld_certificates_certificateNumber_key" ON "sld_certificates"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sld_certificates_deviceSerialId_key" ON "sld_certificates"("deviceSerialId");

-- CreateIndex
CREATE INDEX "sld_certificates_status_generatedAt_idx" ON "sld_certificates"("status", "generatedAt");

-- CreateIndex
CREATE INDEX "_DealerToSldOem_B_index" ON "_DealerToSldOem"("B");

-- AddForeignKey
ALTER TABLE "sld_device_models" ADD CONSTRAINT "sld_device_models_sldOemId_fkey" FOREIGN KEY ("sldOemId") REFERENCES "sld_oems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_device_serials" ADD CONSTRAINT "sld_device_serials_sldOemId_fkey" FOREIGN KEY ("sldOemId") REFERENCES "sld_oems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_device_serials" ADD CONSTRAINT "sld_device_serials_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "sld_device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_device_serials" ADD CONSTRAINT "sld_device_serials_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_certificates" ADD CONSTRAINT "sld_certificates_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_certificates" ADD CONSTRAINT "sld_certificates_sldOemId_fkey" FOREIGN KEY ("sldOemId") REFERENCES "sld_oems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_certificates" ADD CONSTRAINT "sld_certificates_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "sld_device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sld_certificates" ADD CONSTRAINT "sld_certificates_deviceSerialId_fkey" FOREIGN KEY ("deviceSerialId") REFERENCES "sld_device_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DealerToSldOem" ADD CONSTRAINT "_DealerToSldOem_A_fkey" FOREIGN KEY ("A") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DealerToSldOem" ADD CONSTRAINT "_DealerToSldOem_B_fkey" FOREIGN KEY ("B") REFERENCES "sld_oems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
