# SmartVahan EC2 Deployment Script
# Run this script on the EC2 Server in PowerShell as Administrator

# --- Configuration ---
$repoRoot = "C:\smartvahan-src\SMARTVAHAN"
$iisSitePath = "C:\inetpub\wwwroot\smartvahan"
$backendPath = "$repoRoot\backend"
$frontendPath = "$repoRoot\frontend"
$backupRoot = "C:\smartvahan_backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "$backupRoot\backup_$timestamp"

# Set Error Action to Stop on failures
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   SMARTVAHAN DEPLOYMENT SCRIPT" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Backup Phase
Write-Host "`n[1/5] Creating Backups..." -ForegroundColor Yellow
if (!(Test-Path $backupRoot)) { New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# Backup Repo (Backend + Source)
if (Test-Path $backendPath) {
    Write-Host "  - Backing up Backend Source..."
    Copy-Item -Path $backendPath -Destination "$backupDir\backend" -Recurse -Force -ErrorAction SilentlyContinue
}

# Backup IIS Site (Current Frontend)
if (Test-Path $iisSitePath) {
    Write-Host "  - Backing up IIS Frontend..."
    Copy-Item -Path $iisSitePath -Destination "$backupDir\frontend_iis" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Backup saved to: $backupDir" -ForegroundColor Green

# 2. Git Update Phase
Write-Host "`n[2/5] Pulling Latest Code..." -ForegroundColor Yellow
if (Test-Path $repoRoot) {
    Set-Location $repoRoot
    # Reset to match remote exactly (Caution: Discards local changes to tracked files)
    git fetch origin main
    git reset --hard origin/main
    
    # If git pull fails, we stop
    if ($LASTEXITCODE -ne 0) { throw "Git pull failed!" }
    Write-Host "Code updated successfully." -ForegroundColor Green
} else {
    throw "Repository root not found at $repoRoot"
}

# 3. Backend Deployment
Write-Host "`n[3/5] Deploying Backend..." -ForegroundColor Yellow
Set-Location $backendPath

# Install dependencies (only if package.json changed, but good to run)
Write-Host "  - Installing backend dependencies..."
npm install --quiet

# Prisma Generation & Migration
Write-Host "  - Generating Prisma Client..."
npx prisma generate

Write-Host "  - Applying Database Migrations..."
# Ensure DATABASE_URL is available (from system env or .env file)
try {
    npx prisma migrate deploy
    Write-Host "Database migrations applied." -ForegroundColor Green
} catch {
    Write-Warning "Migration step failed or no changes needed. Check logs."
}

# Build Backend
Write-Host "  - Building Backend..."
npm run build

# Restart PM2
Write-Host "  - Restarting PM2 Services..."
pm2 restart all
Start-Sleep -Seconds 5
$pm2Status = pm2 list
Write-Host $pm2Status
Write-Host "Backend deployed and restarted." -ForegroundColor Green

# 4. Frontend Deployment
Write-Host "`n[4/5] Deploying Frontend..." -ForegroundColor Yellow
Set-Location $frontendPath

Write-Host "  - Installing frontend dependencies..."
npm install --quiet

Write-Host "  - Building Frontend (Vite)..."
npm run build

# 5. IIS Update
Write-Host "`n[5/5] Updating IIS Site..." -ForegroundColor Yellow
if (!(Test-Path $iisSitePath)) { New-Item -ItemType Directory -Force -Path $iisSitePath | Out-Null }

# Copy dist files to IIS root
$distPath = "$frontendPath\dist"
if (Test-Path $distPath) {
    # We use Copy-Item with Force. 
    # Note: web.config might be overwritten if it's in dist. 
    # If web.config is managed manually on IIS, we might want to exclude it, 
    # but usually it's part of the repo/build.
    Copy-Item -Path "$distPath\*" -Destination $iisSitePath -Recurse -Force
    Write-Host "Frontend files copied to IIS." -ForegroundColor Green
} else {
    throw "Frontend build directory (dist) not found!"
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "   DEPLOYMENT COMPLETED SUCCESSFULLY" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
