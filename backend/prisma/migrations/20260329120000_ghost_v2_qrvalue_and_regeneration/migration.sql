-- 1) Allow multiple certificates per QRCode (drop old 1:1 unique index)
DROP INDEX IF EXISTS "certificates_qrCodeId_key";

-- 2) Add qrValue snapshot to certificates and backfill from qr_codes.value
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "qrValue" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "certificates" c
    LEFT JOIN "qr_codes" q ON q."id" = c."qrCodeId"
    WHERE q."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill certificates.qrValue: some certificates reference missing qr_codes';
  END IF;
END
$$;

UPDATE "certificates" c
SET "qrValue" = q."value"
FROM "qr_codes" q
WHERE c."qrCodeId" = q."id"
  AND (c."qrValue" IS NULL OR c."qrValue" = '');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "certificates"
    WHERE "qrValue" IS NULL OR "qrValue" = ''
  ) THEN
    RAISE EXCEPTION 'Backfill incomplete: certificates.qrValue contains NULL/empty';
  END IF;
END
$$;

ALTER TABLE "certificates" ALTER COLUMN "qrValue" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "certificates_qrValue_key" ON "certificates"("qrValue");
CREATE INDEX IF NOT EXISTS "certificates_qrCodeId_idx" ON "certificates"("qrCodeId");

-- 3) Ghost regeneration ledger tables
CREATE TABLE IF NOT EXISTS "qr_regeneration_runs" (
  "id" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "oemCode" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "startSerial" INTEGER NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "eligibleCount" INTEGER NOT NULL,
  "regeneratedCount" INTEGER NOT NULL,
  "filePath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "qr_regeneration_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qr_regenerations" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "oemCode" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "serialNumber" INTEGER NOT NULL,
  "oldQrValue" TEXT NOT NULL,
  "newQrValue" TEXT NOT NULL,
  "regeneratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "regeneratedBy" TEXT,
  CONSTRAINT "qr_regenerations_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'qr_regenerations_runId_fkey'
  ) THEN
    ALTER TABLE "qr_regenerations"
      ADD CONSTRAINT "qr_regenerations_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "qr_regeneration_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "qr_regeneration_runs_state_oem_product_createdAt_idx"
  ON "qr_regeneration_runs"("stateCode", "oemCode", "productCode", "createdAt");

CREATE INDEX IF NOT EXISTS "qr_regenerations_state_oem_product_serial_idx"
  ON "qr_regenerations"("stateCode", "oemCode", "productCode", "serialNumber");

CREATE INDEX IF NOT EXISTS "qr_regenerations_newQrValue_idx"
  ON "qr_regenerations"("newQrValue");
