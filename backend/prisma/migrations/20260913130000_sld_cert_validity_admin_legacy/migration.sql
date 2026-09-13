-- Legacy flag on serials (renewal-only rows, not inventory)
ALTER TABLE "sld_device_serials" ADD COLUMN IF NOT EXISTS "isLegacy" BOOLEAN NOT NULL DEFAULT false;

-- Normalize all serial numbers to uppercase
UPDATE "sld_device_serials" SET "serialNumber" = UPPER(TRIM("serialNumber"));

-- Certificate validity + admin nullable dealer + credit charge flag
ALTER TABLE "sld_certificates" ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3);
ALTER TABLE "sld_certificates" ADD COLUMN IF NOT EXISTS "validTo" TIMESTAMP(3);
ALTER TABLE "sld_certificates" ADD COLUMN IF NOT EXISTS "renewalCreditCharged" BOOLEAN NOT NULL DEFAULT false;

-- Backfill validity from generatedAt (+1 year)
UPDATE "sld_certificates"
SET
  "validFrom" = COALESCE("validFrom", "generatedAt"),
  "validTo" = COALESCE("validTo", "generatedAt" + INTERVAL '1 year')
WHERE "validFrom" IS NULL OR "validTo" IS NULL;

-- Allow admin-issued certs without dealer
ALTER TABLE "sld_certificates" ALTER COLUMN "dealerId" DROP NOT NULL;
