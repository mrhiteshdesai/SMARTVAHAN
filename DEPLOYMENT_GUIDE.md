# SmartVahan V2 Deployment Guide (EC2 / Windows Server)

## 🚀 Quick Reference: Manual Deployment Steps

Run these commands in **PowerShell (Admin)** on the server.

### 1. Variables & Setup
```powershell
# Define Paths
$RepoPath   = "C:\smartvahan-src\SMARTVAHAN"
$BackupPath = "C:\smartvahan_backups\$(Get-Date -Format 'yyyy-MM-dd_HH-mm')"
$IISPath    = "C:\inetpub\wwwroot\SMARTVAHAN"

# Create Backup Directory
New-Item -ItemType Directory -Force -Path $BackupPath
```

### 2. Backup Database & Files
```powershell
# 1. Database Dump
$env:PGPASSWORD = "@002550641646Hitesh"
pg_dump -U smartvahan -d smartvahan -f "$BackupPath\smartvahan.sql"
$env:PGPASSWORD = $null

# 2. Backup Uploads (Critical Data)
Robocopy "$RepoPath\backend\uploads" "$BackupPath\uploads" /E

# 3. Backup Current IIS Site (Safety)
Robocopy $IISPath "$BackupPath\iis_site_backup" /E
```

### 3. Update Code
```powershell
Set-Location $RepoPath
git pull origin main
```

### 4. Backend Deployment
```powershell
Set-Location "$RepoPath\backend"

# 1. Install & Build
npm install
npm run build

# 2. Write Production .env (If needed)
$EnvContent = @"
DATABASE_URL="postgresql://smartvahan:@002550641646Hitesh@localhost:5432/smartvahan?schema=public"
BASE_URL="https://smartvahan.net"
JWT_SECRET="c3889fdaba32e2f877b1f7e82685e8c2"
PORT=3000
"@
$EnvContent | Out-File -FilePath ".env" -Encoding UTF8 -Force

# 3. Database Migrations
npx prisma migrate deploy

# 4. Restart Backend Service
pm2 restart backend
```

### 5. Frontend Deployment
```powershell
Set-Location "$RepoPath\frontend"

# 1. Install & Build
npm install
npm run build

# 2. Deploy to IIS
Robocopy "$RepoPath\frontend\dist" $IISPath /E
```

---
**Deployment Complete.** 
Verify at: https://smartvahan.net
