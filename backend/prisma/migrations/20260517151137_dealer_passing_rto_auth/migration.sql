-- AlterTable
ALTER TABLE "dealers" ADD COLUMN     "passingRtoCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "passingRtosAll" BOOLEAN NOT NULL DEFAULT true;

-- RenameIndex
ALTER INDEX "qr_regeneration_runs_state_oem_product_createdAt_idx" RENAME TO "qr_regeneration_runs_stateCode_oemCode_productCode_createdA_idx";

-- RenameIndex
ALTER INDEX "qr_regenerations_state_oem_product_serial_idx" RENAME TO "qr_regenerations_stateCode_oemCode_productCode_serialNumber_idx";
