# System State Log - 2026-01-13 (QA & Security Fixes)

This backup captures the system state after applying critical QA and Security fixes.

## Contents
1.  **schema.prisma**: Defines the database schema, including the `Sequence` model and `Batch` status fields.
2.  **qr.service.ts**: Contains the core logic for:
    *   Input Validation (preventing negative/huge quantities).
    *   Atomic Sequence Generation (using `upsert` to fix race conditions).
    *   Async Batch Processing.
    *   PDF Generation Layout.
3.  **qr.controller.ts**: API endpoints with updated validation logic.
4.  **QRGenerationPage.tsx**: Frontend UI with max limit set to 1,000.
5.  **verify_fixes.js**: Script used to verify the security fixes.

## Key Configurations
*   **Max Batch Size**: 1,000 (Hardcoded in Service and Frontend).
*   **Sequence Logic**: Per-State-OEM (e.g., `QR_SEQ_MH_ORF`).
*   **Database**: PostgreSQL (Env `DATABASE_URL` required).
*   **Storage Path**: `uploads/QR/{STATE}/{BRAND}`.

## Restore Instructions
To restore this state:
1.  Copy the files from this folder back to their respective locations:
    *   `schema.prisma` -> `backend/prisma/schema.prisma`
    *   `qr.service.ts` -> `backend/src/qr/qr.service.ts`
    *   `qr.controller.ts` -> `backend/src/qr/qr.controller.ts`
    *   `QRGenerationPage.tsx` -> `frontend/src/pages/qr/QRGenerationPage.tsx`
2.  Run `npx prisma generate` in `backend`.
3.  Restart the backend server.
