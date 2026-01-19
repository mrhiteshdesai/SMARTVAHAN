-- DropForeignKey
ALTER TABLE "certificates" DROP CONSTRAINT "certificates_qrCodeId_fkey";

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
