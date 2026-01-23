<#
.SYNOPSIS
    SmartVahan V2 - Server Backup & Deployment Script
    Run this script on your Windows Server (EC2) to safely backup and deploy the latest code.

.DESCRIPTION
    1. Creates a timestamped backup of DB, Backend Code, Frontend Build, and Uploads.
    2. Pulls latest code from Git.
    3. Writes production .env file.
    4. Installs dependencies and builds Backend & Frontend.
    5. Runs Database Migrations.
    6. Restarts Backend Service (PM2).
    7. Copies Frontend build to IIS Site directory.
#>

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
$ProjectRoot    = "C:\smartvahan-src\SMARTVAHAN"
$IISSitePath    = "C:\inetpub\wwwroot\SMARTVAHAN"  # Assumed 'wwwroot' based on standard IIS paths
$BackupRoot     = "C:\smartvahan_backups"

# Database Config
$DbName         = "smartvahan"
$DbUser         = "smartvahan"
$DbPassword     = "@002550641646Hitesh"
$PgDumpPath     = "pg_dump"  # Ensure this is in PATH or provide full path
$Pm2ServiceName = "backend"

# Environment Variables Content
$EnvContent = @"
DATABASE_URL="postgresql://smartvahan:@002550641646Hitesh@localhost:5432/smartvahan?schema=public"
BASE_URL="https://smartvahan.net"
BASE_DOMAIN="smartvahan.net"
JWT_SECRET="c3889fdaba32e2f877b1f7e82685e8c2"
PORT=3000
"@

# ---------------------------------------------------------------------------
# SETUP
# ---------------------------------------------------------------------------
$DateStamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$CurrentBackupDir = Join-Path $BackupRoot $DateStamp

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " SMARTVAHAN V2 - BACKUP & DEPLOYMENT" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Timestamp: $DateStamp"
Write-Host "Project:   $ProjectRoot"
Write-Host "IIS Site:  $IISSitePath"
Write-Host "Backup To: $CurrentBackupDir"
Write-Host ""

# Check if Project Dir exists
if (-not (Test-Path $ProjectRoot)) {
    Write-Error "Project directory not found at $ProjectRoot. Please clone the repo first."
    exit 1
}

# Create Backup Directory
New-Item -ItemType Directory -Force -Path $CurrentBackupDir | Out-Null
Write-Host "[+] Created backup directory" -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 1: DATABASE BACKUP
# ---------------------------------------------------------------------------
Write-Host "`n[1/6] Backing up Database ($DbName)..." -ForegroundColor Yellow
$DbBackupFile = Join-Path $CurrentBackupDir "$DbName.sql"

# Set PGPASSWORD environment variable for this session
$env:PGPASSWORD = $DbPassword

try {
    & $PgDumpPath -U $DbUser -d $DbName -f $DbBackupFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Success: Database dumped to $DbBackupFile" -ForegroundColor Green
    } else {
        Write-Warning "    Failed: pg_dump returned exit code $LASTEXITCODE. Check credentials or path."
    }
} catch {
    Write-Warning "    Error running pg_dump. Is PostgreSQL installed and in PATH?"
}
# Clear password from env
$env:PGPASSWORD = $null

# ---------------------------------------------------------------------------
# STEP 2: FILE BACKUP
# ---------------------------------------------------------------------------
Write-Host "`n[2/6] Backing up Files..." -ForegroundColor Yellow

# Function to safely copy
function Safe-Copy ($Source, $Dest, $Exclude) {
    if (Test-Path $Source) {
        $CmdArgs = @($Source, $Dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS")
        if ($Exclude) { $CmdArgs += "/XD"; $CmdArgs += $Exclude }
        Robocopy @CmdArgs
        Write-Host "    Backed up: $(Split-Path $Source -Leaf)" -ForegroundColor Gray
    } else {
        Write-Warning "    Source not found: $Source"
    }
}

# Backup Backend (Skip node_modules to be fast)
Safe-Copy "$ProjectRoot\backend" "$CurrentBackupDir\backend" @("node_modules", ".git", "dist")

# Backup Uploads (CRITICAL)
Safe-Copy "$ProjectRoot\backend\uploads" "$CurrentBackupDir\uploads" @()

# Backup Current IIS Site
Safe-Copy $IISSitePath "$CurrentBackupDir\iis_site_backup" @()

Write-Host "[+] Backup Complete" -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 3: GIT PULL & ENV SETUP
# ---------------------------------------------------------------------------
Write-Host "`n[3/6] Pulling Latest Code & Setting Env..." -ForegroundColor Yellow
Set-Location $ProjectRoot
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "Git pull failed. Please resolve conflicts manually."
    exit 1
}

# Write .env file
$EnvFilePath = Join-Path "$ProjectRoot\backend" ".env"
$EnvContent | Out-File -FilePath $EnvFilePath -Encoding UTF8 -Force
Write-Host "    Updated .env file at $EnvFilePath" -ForegroundColor Gray
Write-Host "[+] Code updated and Env set" -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 4: BACKEND DEPLOYMENT
# ---------------------------------------------------------------------------
Write-Host "`n[4/6] Deploying Backend..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\backend"

Write-Host "    Installing dependencies..."
npm install | Out-Null

Write-Host "    Building NestJS..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }

Write-Host "    Running Database Migrations..."
# Set ENV for migration
$env:DATABASE_URL = "postgresql://$($DbUser):$($DbPassword)@localhost:5432/$($DbName)?schema=public"
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Error "DB Migration failed"; exit 1 }

Write-Host "    Restarting PM2 Service..."
pm2 restart $Pm2ServiceName
if ($LASTEXITCODE -ne 0) { 
    Write-Warning "    PM2 restart failed. Trying to start..."
    pm2 start dist/src/main.js --name $Pm2ServiceName
}

# ---------------------------------------------------------------------------
# STEP 5: FRONTEND BUILD
# ---------------------------------------------------------------------------
Write-Host "`n[5/6] Building Frontend..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\frontend"

Write-Host "    Installing dependencies..."
npm install | Out-Null

Write-Host "    Building React App..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }

# ---------------------------------------------------------------------------
# STEP 6: IIS DEPLOYMENT
# ---------------------------------------------------------------------------
Write-Host "`n[6/6] Deploying to IIS ($IISSitePath)..." -ForegroundColor Yellow

if (-not (Test-Path $IISSitePath)) {
    New-Item -ItemType Directory -Force -Path $IISSitePath | Out-Null
}

$DistPath = "$ProjectRoot\frontend\dist"
# Copy contents of dist to IIS path
Robocopy $DistPath $IISSitePath /E /NFL /NDL /NJH /NJS
Write-Host "    Copied build files to IIS Site" -ForegroundColor Gray

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " DEPLOYMENT SUCCESSFUL" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Backup Location: $CurrentBackupDir"
Write-Host "Site: https://smartvahan.net"
