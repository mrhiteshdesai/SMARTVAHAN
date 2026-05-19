-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "contactPersonName" TEXT;
ALTER TABLE "dealers" ADD COLUMN "email" TEXT;

-- AlterTable
ALTER TABLE "dealer_registration_requests" ADD COLUMN "firstName" TEXT;
ALTER TABLE "dealer_registration_requests" ADD COLUMN "lastName" TEXT;
ALTER TABLE "dealer_registration_requests" ADD COLUMN "email" TEXT;
ALTER TABLE "dealer_registration_requests" ADD COLUMN "dealerName" TEXT;
ALTER TABLE "dealer_registration_requests" ADD COLUMN "passingRtoCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

