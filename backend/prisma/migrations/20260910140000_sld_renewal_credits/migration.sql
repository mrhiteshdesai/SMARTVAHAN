-- CreateEnum
CREATE TYPE "SldCertKind" AS ENUM ('NEW', 'RENEWAL');

-- AlterTable dealers
ALTER TABLE "dealers" ADD COLUMN IF NOT EXISTS "sldRenewalCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable sld_certificates: kind + drop one-cert-per-serial unique
ALTER TABLE "sld_certificates" ADD COLUMN IF NOT EXISTS "kind" "SldCertKind" NOT NULL DEFAULT 'NEW';

DROP INDEX IF EXISTS "sld_certificates_deviceSerialId_key";

CREATE INDEX IF NOT EXISTS "sld_certificates_deviceSerialId_generatedAt_idx"
  ON "sld_certificates"("deviceSerialId", "generatedAt");

CREATE INDEX IF NOT EXISTS "sld_certificates_kind_generatedAt_idx"
  ON "sld_certificates"("kind", "generatedAt");

-- Renewal credit ledger
CREATE TABLE IF NOT EXISTS "sld_renewal_credit_logs" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sld_renewal_credit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sld_renewal_credit_logs_dealerId_createdAt_idx"
  ON "sld_renewal_credit_logs"("dealerId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "sld_renewal_credit_logs"
    ADD CONSTRAINT "sld_renewal_credit_logs_dealerId_fkey"
    FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
