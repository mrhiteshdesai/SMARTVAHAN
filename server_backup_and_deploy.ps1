<#
.SYNOPSIS
    SmartVahan V2 - Server Backup & Deployment Script
    Run this script on your Windows Server (EC2) to safely backup and deploy the latest code.

.DESCRIPTION
    1. Creates a timestamped backup of DB, Backend Code, Frontend Build, and Uploads.
    2. Pulls latest code from Git.
    3. Installs dependencies and builds Backend & Frontend.
    4. Runs Database Migrations.
    5. Restarts Backend Service (PM2).

.NOTES
    - Ensure 'pg_dump' is in your system PATH or update $PgDumpPath.
    - Ensure you have Git, Node.js, and PM2 installed.
#>

# ---------------------------------------------------------------------------
# CONFIGURATION - ADJUST THESE PATHS FOR YOUR SERVER
# ---------------------------------------------------------------------------
$ProjectRoot = "C:\Users\Administrator\Documents\SMARTVAHAN_V2"  # <--- UPDATE THIS
$BackupRoot  = "C:\Backups\SmartVahan"                           # <--- UPDATE THIS
$DbName      = "smartvahan_db"                                   # <--- UPDATE THIS
$DbUser      = "postgres"                                        # <--- UPDATE THIS
# If pg_dump is not in PATH, specify full path (e.g., "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe")
$PgDumpPath  = "pg_dump" 
$Pm2ServiceName = "backend"

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
Write-Host "Backup To: $CurrentBackupDir"
Write-Host ""

# Check if Project Dir exists
if (-not (Test-Path $ProjectRoot)) {
    Write-Error "Project directory not found at $ProjectRoot. Please update the script configuration."
    exit 1
}

# Create Backup Directory
New-Item -ItemType Directory -Force -Path $CurrentBackupDir | Out-Null
Write-Host "[+] Created backup directory" -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 1: DATABASE BACKUP
# ---------------------------------------------------------------------------
Write-Host "`n[1/5] Backing up Database ($DbName)..." -ForegroundColor Yellow
$DbBackupFile = Join-Path $CurrentBackupDir "$DbName.sql"
try {
    # Note: If password prompt appears, set PGPASSWORD env var before running script
    # $env:PGPASSWORD='your_password'
    & $PgDumpPath -U $DbUser -d $DbName -f $DbBackupFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Success: Database dumped to $DbBackupFile" -ForegroundColor Green
    } else {
        Write-Warning "    Failed: pg_dump returned exit code $LASTEXITCODE. Check credentials or path."
    }
} catch {
    Write-Warning "    Error running pg_dump. Is PostgreSQL installed and in PATH?"
}

# ---------------------------------------------------------------------------
# STEP 2: FILE BACKUP
# ---------------------------------------------------------------------------
Write-Host "`n[2/5] Backing up Files..." -ForegroundColor Yellow

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

# Backup Frontend Dist (Current Live Site)
Safe-Copy "$ProjectRoot\frontend\dist" "$CurrentBackupDir\frontend_dist_backup" @()

Write-Host "[+] Backup Complete" -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 3: GIT PULL
# ---------------------------------------------------------------------------
Write-Host "`n[3/5] Pulling Latest Code..." -ForegroundColor Yellow
Set-Location $ProjectRoot
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "Git pull failed. Please resolve conflicts manually."
    exit 1
}
Write-Host "[+] Code updated" -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 4: BACKEND DEPLOYMENT
# ---------------------------------------------------------------------------
Write-Host "`n[4/5] Deploying Backend..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\backend"

Write-Host "    Installing dependencies..."
npm install | Out-Null

Write-Host "    Building NestJS..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }

Write-Host "    Running Database Migrations..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Error "DB Migration failed"; exit 1 }

Write-Host "    Restarting PM2 Service..."
pm2 restart $Pm2ServiceName
if ($LASTEXITCODE -ne 0) { 
    Write-Warning "    PM2 restart failed. Trying to start..."
    pm2 start dist/src/main.js --name $Pm2ServiceName
}

# ---------------------------------------------------------------------------
# STEP 5: FRONTEND DEPLOYMENT
# ---------------------------------------------------------------------------
Write-Host "`n[5/5] Deploying Frontend..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\frontend"

Write-Host "    Installing dependencies..."
npm install | Out-Null

Write-Host "    Building React App..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " DEPLOYMENT SUCCESSFUL" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Backup Location: $CurrentBackupDir"
Write-Host "Please verify the site is accessible."
