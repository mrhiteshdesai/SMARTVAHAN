-- AlterTable
ALTER TABLE "certificates" ADD COLUMN "dealerId" TEXT;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
