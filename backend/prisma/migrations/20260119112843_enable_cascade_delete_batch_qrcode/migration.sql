-- DropForeignKey
ALTER TABLE "qr_codes" DROP CONSTRAINT "qr_codes_batchId_fkey";

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
