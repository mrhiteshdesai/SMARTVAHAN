# Deployment Script for SmartVahan
# Run this on the Live EC2 Server as Administrator

# --- Configuration ---
$RepoPath = "C:\smartvahan-src\SMARTVAHAN"
$IISPath = "C:\inetpub\wwwroot\SMARTVAHAN"
$BackupPath = "C:\Backups\SmartVahan_$(Get-Date -Format 'yyyyMMdd_HHmm')"
$DbPassword = "@002550641646Hitesh"

# --- 1. Setup & Tools Check ---
Write-Host ">>> 1. Checking Tools..." -ForegroundColor Cyan

# === LOCATE PG_DUMP (CRITICAL STEP) ===
Write-Host "Locating pg_dump.exe..."
$PgDumpPath = $null

# 1. Check if in global PATH first
if (Get-Command "pg_dump" -ErrorAction SilentlyContinue) {
    $PgDumpPath = "pg_dump"
    Write-Host "pg_dump found in system PATH."
} else {
    # 2. Check common installation directories
    $PossiblePaths = @(
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\13\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\12\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\11\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\10\bin\pg_dump.exe"
    )
    
    foreach ($path in $PossiblePaths) {
        if (Test-Path $path) {
            $PgDumpPath = $path
            Write-Host "pg_dump found at: $PgDumpPath"
            break
        }
    }
}

# If still not found, FAIL IMMEDIATELY
if (-not $PgDumpPath) {
    Write-Error "CRITICAL ERROR: pg_dump.exe could not be found in PATH or standard locations."
    Write-Error "Database backup cannot run. Aborting deployment to prevent data loss."
    exit 1
}

# --- 2. Create Backup Directory ---
Write-Host ">>> 2. Creating Backup Directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $BackupPath | Out-Null
Write-Host "Backups will be stored in: $BackupPath"

# --- 3. Backup Frontend (IIS) ---
Write-Host ">>> 3. Backing up Frontend (IIS)..." -ForegroundColor Cyan
if (Test-Path $IISPath) {
    Compress-Archive -Path "$IISPath\*" -DestinationPath "$BackupPath\frontend_backup.zip" -Force
    Write-Host "Frontend backup saved."
}

# --- 4. Backup Backend (Source) ---
Write-Host ">>> 4. Backing up Backend Code..." -ForegroundColor Cyan
if (Test-Path "$RepoPath\backend") {
    $TempBackendBackup = "$BackupPath\backend_temp"
    New-Item -ItemType Directory -Force -Path $TempBackendBackup | Out-Null
    
    $ItemsToBackup = @("src", "prisma", "uploads", ".env", "package.json", "tsconfig.json", "nest-cli.json")
    foreach ($item in $ItemsToBackup) {
        $SourceItem = "$RepoPath\backend\$item"
        if (Test-Path $SourceItem) {
            Copy-Item -Path $SourceItem -Destination $TempBackendBackup -Recurse -Force
        }
    }
    Compress-Archive -Path "$TempBackendBackup\*" -DestinationPath "$BackupPath\backend_source_backup.zip" -Force
    Remove-Item -Path $TempBackendBackup -Recurse -Force
    Write-Host "Backend source backup saved."
}

# --- 5. Backup Database (EXECUTE PG_DUMP) ---
Write-Host ">>> 5. Backing up Database..." -ForegroundColor Cyan
try {
    $env:PGPASSWORD = $DbPassword
    
    # Use invocation operator '&' to run the command path (handles spaces in path)
    # Syntax: & "path\to\exe" arguments
    Write-Host "Executing: & `"$PgDumpPath`" -h localhost -U smartvahan -d smartvahan ..."
    
    & $PgDumpPath -h localhost -U smartvahan -d smartvahan -f "$BackupPath\db_backup.sql"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database backup SUCCESSFUL: $BackupPath\db_backup.sql" -ForegroundColor Green
    } else {
        throw "pg_dump exited with error code $LASTEXITCODE"
    }
} catch {
    Write-Error "Database backup FAILED! Error: $_"
    Write-Error "Aborting deployment to preserve current state."
    exit 1
}

# --- 6. Git Reset & Pull ---
Write-Host ">>> 6. Updating Code (Git Reset & Pull)..." -ForegroundColor Cyan
Set-Location $RepoPath
git reset --hard
git pull origin main

# --- 6.5 Stop Backend Service (Prevent File Locking) ---
Write-Host ">>> 6.5 Stopping Backend Service..." -ForegroundColor Cyan
try {
    pm2 stop smartvahan-backend
    Write-Host "Backend service stopped to release file locks."
} catch {
    Write-Warning "Could not stop backend service (might not be running)."
}

# --- 7. Backend Setup ---
Write-Host ">>> 7. Configuring Backend..." -ForegroundColor Cyan
Set-Location "$RepoPath\backend"

# Write .env file
$EnvContent = @"
DATABASE_URL="postgresql://smartvahan:@002550641646Hitesh@localhost:5432/smartvahan?schema=public"
BASE_URL="https://smartvahan.net"
BASE_DOMAIN="smartvahan.net"
JWT_SECRET="c3889fdaba32e2f877b1f7e82685e8c2"
PORT=3000
"@
Set-Content -Path .env -Value $EnvContent

# Install & Build
Write-Host "Installing Backend Dependencies..."
npm install

# Force clean Prisma cache to prevent locking issues
if (Test-Path "node_modules\.prisma") {
    Write-Host "Cleaning .prisma cache..."
    Remove-Item -Path "node_modules\.prisma" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Generating Prisma Client..."
npx prisma generate
Write-Host "Running Database Migrations..."
npx prisma migrate deploy 
Write-Host "Seeding Database (Updating Ghost Admin)..."
npx prisma db seed
Write-Host "Building Backend..."
npm run build

# --- 8. PM2 Management ---
Write-Host ">>> 8. Managing PM2 Service..." -ForegroundColor Cyan
try {
    $pm2List = pm2 list
    if ($pm2List -match "smartvahan-backend") {
        Write-Host "Restarting existing PM2 process..."
        pm2 restart smartvahan-backend
    } else {
        Write-Host "Starting new PM2 process..."
        pm2 start dist/main.js --name smartvahan-backend
    }
    pm2 save
} catch {
    Write-Warning "PM2 Error. Ensure PM2 is installed (npm i -g pm2)."
}

# --- 9. Frontend Setup ---
Write-Host ">>> 9. Configuring Frontend..." -ForegroundColor Cyan
Set-Location "$RepoPath\frontend"

# Clean previous build
if (Test-Path "dist") {
    Write-Host "Cleaning previous frontend build..."
    Remove-Item -Path "dist" -Recurse -Force
}

Write-Host "Installing Frontend Dependencies..."
npm install
Write-Host "Building React Application..."
npm run build

# Verify Build
if (-not (Test-Path "dist\index.html")) {
    Write-Error "Frontend Build FAILED! dist\index.html not found."
    exit 1
}

# --- 10. IIS Deployment ---
Write-Host ">>> 10. Deploying to IIS..." -ForegroundColor Cyan

# Stop IIS Site (Optional, prevents file locking)
# Write-Host "Stopping IIS Site..."
# Stop-WebSite -Name "Default Web Site"  # Adjust name if needed

# Clear old files safely
Write-Host "Clearing old IIS files..."
Get-ChildItem -Path $IISPath -Recurse | Where-Object { $_.Name -ne "web.config" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Copying new files..."
Copy-Item -Path "dist\*" -Destination $IISPath -Recurse -Force

# Start IIS Site
# Start-WebSite -Name "Default Web Site"

Write-Host ">>> DEPLOYMENT COMPLETE SUCCESSFULLY! <<<" -ForegroundColor Green
