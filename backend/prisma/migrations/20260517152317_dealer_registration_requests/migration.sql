-- CreateEnum
CREATE TYPE "DealerRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "dealer_registration_requests" (
    "id" TEXT NOT NULL,
    "status" "DealerRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "stateCode" TEXT,
    "locationAddress" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius" DOUBLE PRECISION,
    "oemCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gstNo" TEXT,
    "tradeCertificateNo" TEXT,
    "tradeValidity" TIMESTAMP(3),
    "aadharNumber" TEXT,
    "tradeCertificateUrl" TEXT,
    "gstCertificateUrl" TEXT,
    "aadharCardUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "dealerId" TEXT,

    CONSTRAINT "dealer_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dealer_registration_requests_status_createdAt_idx" ON "dealer_registration_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "dealer_registration_requests" ADD CONSTRAINT "dealer_registration_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_registration_requests" ADD CONSTRAINT "dealer_registration_requests_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
