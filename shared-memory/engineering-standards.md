# Engineering Standards — SMARTVAHAN V2

## Stack
- Admin web: React + Vite + Tailwind
- API: NestJS + Prisma + PostgreSQL
- Mobile: **Flutter** — `smartvahan_dealer_app`, `smartscanner_app`

## Notes
- `SYSTEM_STATE_LOG.md` (Jan 2026) is historical (localStorage era) — do not treat as current architecture
- Tender FRS Word docs are source for formal requirements extraction
- Deploy docs: `DEPLOYMENT_GUIDE_v2.md`, `deploy_ec2.ps1`

## Security
- Replace any remaining hardcoded credentials before production
- Dealer/certificate data is PII-sensitive
