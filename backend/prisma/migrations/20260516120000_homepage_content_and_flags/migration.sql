-- Add home page display flags
ALTER TABLE "states" ADD COLUMN IF NOT EXISTS "showOnHomepage" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "oems" ADD COLUMN IF NOT EXISTS "showOnHomepage" BOOLEAN NOT NULL DEFAULT true;

-- Add editable home page content container
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "homePageContent" JSONB;

-- Store public contact submissions
CREATE TABLE IF NOT EXISTS "contact_submissions" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);
