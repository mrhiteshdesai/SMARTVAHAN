# SMARTVAHAN — Deployment Guide (2026-09-08)

Run these steps **on the live Windows EC2 server** (PowerShell as Administrator).

## What’s in this release

| Area | Change |
|------|--------|
| **Backend** | Dashboard date filter end-of-day fix (`endDate` now includes full last day `23:59:59.999`) |
| **Frontend** | Dashboard filters apply only on **Filter** click (not on every field change) + Reset |
| **Frontend** | Menu: Reflective MIS / SLD MIS reorder (if not already live) |

> No new Prisma migration is required for this release.

---

## 0. Paths (confirm once)

```powershell
$ProjectRoot = "C:\smartvahan-src\SMARTVAHAN"
$IISPath     = "C:\inetpub\wwwroot\SMARTVAHAN"
$BackupRoot  = "C:\Backups\SmartVahan_$(Get-Date -Format 'yyyyMMdd_HHmm')"
```

If your IIS folder differs, update `$IISPath` before continuing.

---

## 1. Backup (do this first)

```powershell
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

# --- DB dump (custom format) ---
# Read credentials from existing .env — do not hardcode passwords in chat logs
Get-Content "$ProjectRoot\backend\.env" | Select-String "DATABASE_URL"

$PgDump = (Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" | Sort-Object FullName -Descending | Select-Object -First 1).FullName
$env:PGPASSWORD = "PASTE_PASSWORD_FROM_ENV"   # use single quotes if password has @ # etc.

& $PgDump -h localhost -U smartvahan -d smartvahan -F c -f "$BackupRoot\smartvahan_full.dump" -v 2>&1 |
  Tee-Object "$BackupRoot\pg_dump_log.txt"

# Verify dump is NOT 0 KB
Get-Item "$BackupRoot\smartvahan_full.dump" | Format-List FullName, Length

# --- Code + uploads backup ---
Compress-Archive -Path "$ProjectRoot\backend\src","$ProjectRoot\backend\dist","$ProjectRoot\backend\.env" `
  -DestinationPath "$BackupRoot\backend_code.zip" -Force -ErrorAction SilentlyContinue

if (Test-Path "$ProjectRoot\backend\uploads") {
  Compress-Archive -Path "$ProjectRoot\backend\uploads" -DestinationPath "$BackupRoot\uploads.zip" -Force
}

if (Test-Path $IISPath) {
  Compress-Archive -Path "$IISPath\*" -DestinationPath "$BackupRoot\frontend_iis.zip" -Force
}

Write-Host "Backup folder: $BackupRoot" -ForegroundColor Green
```

Stop if dump `Length` is `0`. Fix DB login first (see dump log).

---

## 2. Pull / sync code

### Option A — Git on server (preferred)

```powershell
cd $ProjectRoot
git status
git fetch --all
git pull origin main
# OR if you deploy a specific branch/tag:
# git checkout <branch>
# git pull
```

### Option B — Copy from your PC

If git on server is behind / not used for this change set:

1. On your PC, zip these changed areas from `C:\Projects\SMARTVAHAN-V2`:
   - `backend\src\stats\stats.service.ts`
   - `frontend\src\pages\Dashboard.tsx`
   - (any other pending files you intend to ship)
2. Copy zip to server and extract over `$ProjectRoot`.

---

## 3. Backend build + restart

```powershell
cd "$ProjectRoot\backend"

# Keep existing .env — do not overwrite unless you intend to
npm install
npx prisma generate
npm run build

# Confirm build output
Test-Path ".\dist\src\main.js"
# If False, check: Test-Path ".\dist\main.js"

# PM2
pm2 status
if ((pm2 jlist | ConvertFrom-Json).name -contains "smartvahan-backend") {
  pm2 restart smartvahan-backend
} else {
  # First-time / empty PM2 list:
  if (Test-Path ".\dist\src\main.js") {
    pm2 start dist\src\main.js --name smartvahan-backend
  } else {
    pm2 start dist\main.js --name smartvahan-backend
  }
  pm2 save
}

pm2 status
pm2 logs smartvahan-backend --lines 40
```

Health check:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api" -UseBasicParsing
# 404 on /api root is OK — means Nest is responding
```

---

## 4. Frontend build + IIS publish

```powershell
cd "$ProjectRoot\frontend"
npm install
npm run build

# Confirm build
Test-Path ".\dist\index.html"

# Publish to IIS (preserve web.config)
Copy-Item -Path ".\dist\*" -Destination $IISPath -Recurse -Force

Write-Host "Frontend published to $IISPath" -ForegroundColor Green
```

---

## 5. Verification checklist

1. Open `https://smartvahan.net/control` and login as SUPER_ADMIN.
2. **Dashboard filters**
   - Change State / dates — page must **not** reload until you click **Filter**.
   - Click **Reset** — returns to unfiltered view.
3. **Date end-day fix (CG example)**
   - State = Chhattisgarh (`CG`)
   - From `2026-01-01` To `2026-01-31` → click **Filter**
   - Expect C3 / CT used totals near **3,179 / 4,557** (not 2,940 / 4,229).
4. **OEM Report** export still works (already used correct end-of-day).
5. Dealer app login still works (if mobile version gate is enabled, keep ACTIVE versions configured).

---

## 6. Rollback (if needed)

```powershell
# Restore previous backend build from backup zip if required, then:
cd "$ProjectRoot\backend"
pm2 restart smartvahan-backend

# Restore IIS frontend
Expand-Archive -Path "$BackupRoot\frontend_iis.zip" -DestinationPath $IISPath -Force
```

DB rollback only if a migration was applied (not needed for this release):

```powershell
# Only if you must restore DB — destructive
# pg_restore -h localhost -U smartvahan -d smartvahan --clean --if-exists "$BackupRoot\smartvahan_full.dump"
```

---

## Quick one-liner summary

```text
Backup DB → pull/copy code → backend npm install + build → pm2 restart
→ frontend npm install + build → copy dist to IIS → verify Filter + Jan CG totals
```
