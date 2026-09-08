# Project Context

## Project
- **Name:** SMARTVAHAN V2
- **Type:** Civic / vehicle compliance (GovTech-adjacent) — HSRP / QR / dealer / OEM / RTO workflows
- **Description:** SmartVahan platform — NestJS API + React admin + Flutter dealer app + Flutter public QR scanner. Working copy: `C:\Projects\SMARTVAHAN-V2`.

## Requirements
- **Status:** IN_PROGRESS (tender FRS present as Word docs — convert/extract to SRS/FRS markdown before freeze)
- **Frozen date:** —
- **Source docs:**
  - `Tender_FRS_SmartVahan.docx` (+ Explanatory)
  - `tech-requirements.pdf`
  - Tender comparison matrices
  - Copied under `docs/02-requirements/`

## Stack overrides
- **Web (admin):** React + Vite + TypeScript + Tailwind (`frontend/`)
- **Backend:** NestJS + Prisma + PostgreSQL (`backend/`) — **Flutter default does not apply to web**
- **Mobile:** **Flutter** (default)
  - `smartvahan_dealer_app/` — dealer app (v2.0.0+1)
  - `smartscanner_app/` — public QR verification (v1.2.0+1)
- **Cloud / deploy:** EC2 scripts (`deploy_ec2.ps1`, `DEPLOYMENT_GUIDE_v2.md`), IIS `web.config`, AWS S3 in backend deps

## Current state
- **Migration:** Copied 2026-08-06 from `C:\Files\ManualTraeMigrationBackup\projects\trae_projects\SMARTVAHAN V2`
- **Git:** Yes
- **Excluded:** `node_modules`, `.dart_tool`, `127.0.0.1` vite cache, `_backups`
- **Note:** `SYSTEM_STATE_LOG.md` (2026-01-12) describes an early localStorage/mock-auth stage — **outdated**. Current tree has full Prisma models (Dealers, OEM, QR, Certificates, Batches, etc.). Treat log as historical only.

## Active expertise packs
- [x] India GovTech / tender FRS literacy
- [x] SaaS / multi-party roles (OEM, Dealer, RTO, State)
- [x] Flutter mobile (dealer + scanner)
- [ ] DOOH CMS
- [ ] Surveillance IoT
- [ ] Media/DRM

## Key domains (from Prisma)
User, State, RTO, OEM, Dealer, DealerRegistrationRequest, VehicleManufacturer, VehicleCategory, Product, Batch, QRCode, Certificate, QRRegeneration*, Sequence, ManufacturingYear, SystemSettings, ContactSubmission, AuditLog, InventoryLog

## Module-wise delivery
- Module-by-module with local review
- Mobile work uses Flutter apps in-repo

## Compliance
- [ ] DPDP (dealer/user PII)
- [ ] CERT-In
- [ ] GIGW 3.0 / WCAG as needed for public scanner UX
- [ ] Tender compliance matrix review

## Where we left off
Onboarded to Cursor at `C:\Projects\SMARTVAHAN-V2`. Next: open folder in Cursor, `npm install` + `flutter pub get`, review tender FRS → extract markdown SRS/FRS → `/freeze-requirements` or continue module inventory against Prisma.
