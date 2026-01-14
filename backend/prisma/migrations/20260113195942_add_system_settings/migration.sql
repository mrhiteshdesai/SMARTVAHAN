/*
  Warnings:

  - You are about to drop the column `oemCode` on the `dealers` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "dealers" DROP CONSTRAINT "dealers_oemCode_fkey";

-- DropForeignKey
ALTER TABLE "dealers" DROP CONSTRAINT "dealers_rtoCode_fkey";

-- AlterTable
ALTER TABLE "dealers" DROP COLUMN "oemCode",
ADD COLUMN     "allRTOs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstNo" TEXT,
ADD COLUMN     "tradeCertificateNo" TEXT,
ALTER COLUMN "rtoCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "vehicle_manufacturers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT,
    "pcBindingId" TEXT,
    "stateCode" TEXT NOT NULL,
    "oemCode" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startSerial" TEXT,
    "endSerial" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "fullUrl" TEXT NOT NULL,
    "serialNumber" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "qrCodeId" TEXT NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleCategory" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "passingRto" TEXT NOT NULL,
    "registrationRto" TEXT NOT NULL,
    "series" TEXT,
    "manufacturingYear" TEXT NOT NULL,
    "chassisNumber" TEXT NOT NULL,
    "engineNumber" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerContact" TEXT NOT NULL,
    "photoFrontLeft" TEXT NOT NULL,
    "photoBackRight" TEXT NOT NULL,
    "photoNumberPlate" TEXT NOT NULL,
    "photoRc" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locationText" TEXT,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturing_years" (
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manufacturing_years_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'SYSTEM_SETTINGS',
    "systemName" TEXT NOT NULL DEFAULT 'SMARTVAHAN',
    "systemLogo" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#4F46E5',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "googlePlacesKey" TEXT,
    "awsAccessKey" TEXT,
    "awsSecretKey" TEXT,
    "awsRegion" TEXT,
    "awsBucket" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DealerToOEM" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DealerToOEM_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_manufacturers_name_key" ON "vehicle_manufacturers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_categories_name_key" ON "vehicle_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "batches_batchId_key" ON "batches"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_value_key" ON "qr_codes"("value");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_qrCodeId_key" ON "certificates"("qrCodeId");

-- CreateIndex
CREATE INDEX "_DealerToOEM_B_index" ON "_DealerToOEM"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "states"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_oemCode_fkey" FOREIGN KEY ("oemCode") REFERENCES "oems"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_rtoCode_fkey" FOREIGN KEY ("rtoCode") REFERENCES "rtos"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_oemCode_fkey" FOREIGN KEY ("oemCode") REFERENCES "oems"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_productCode_fkey" FOREIGN KEY ("productCode") REFERENCES "products"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "qr_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DealerToOEM" ADD CONSTRAINT "_DealerToOEM_A_fkey" FOREIGN KEY ("A") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DealerToOEM" ADD CONSTRAINT "_DealerToOEM_B_fkey" FOREIGN KEY ("B") REFERENCES "oems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
