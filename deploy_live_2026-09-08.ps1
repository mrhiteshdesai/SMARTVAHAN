<#
.SYNOPSIS
  SMARTVAHAN live EC2 deployment (2026-09-08 release)

.DESCRIPTION
  Run as Administrator on the live Windows EC2 server.
  - Backs up DB + IIS frontend (+ optional uploads)
  - Pulls latest git main
  - Builds backend, restarts PM2
  - Builds frontend, publishes to IIS

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy_live_2026-09-08.ps1

.EXAMPLE
  .\deploy_live_2026-09-08.ps1 -SkipBackup
  .\deploy_live_2026-09-08.ps1 -BackendOnly
  .\deploy_live_2026-09-08.ps1 -FrontendOnly
#>

param(
  [switch]$SkipBackup,
  [switch]$SkipGitPull,
  [switch]$BackendOnly,
  [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# CONFIG — edit if needed
# ---------------------------------------------------------------------------
$ProjectRoot    = "C:\smartvahan-src\SMARTVAHAN"
$IISPath        = "C:\inetpub\wwwroot\SMARTVAHAN"
$BackupRoot     = "C:\Backups\SmartVahan_$(Get-Date -Format 'yyyyMMdd_HHmm')"
$Pm2Name        = "smartvahan-backend"
$GitBranch      = "main"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host ">>> $msg" -ForegroundColor Cyan
}

function Assert-Path([string]$path, [string]$label) {
  if (-not (Test-Path $path)) {
    throw "$label not found: $path"
  }
}

function Get-PgDumpPath {
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $found = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($found) { return $found.FullName }
  throw "pg_dump.exe not found. Install PostgreSQL client tools or add to PATH."
}

function Get-DbCredsFromEnv([string]$envFile) {
  if (-not (Test-Path $envFile)) {
    throw ".env not found: $envFile"
  }
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $line) { throw "DATABASE_URL missing in $envFile" }

  # postgresql://USER:PASSWORD@HOST:PORT/DB?...
  if ($line -notmatch 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?\s"]+)') {
    throw "Could not parse DATABASE_URL from .env"
  }
  return [pscustomobject]@{
    User     = $Matches[1]
    Password = [uri]::UnescapeDataString($Matches[2])
    Host     = $Matches[3]
    Port     = $Matches[4]
    Database = $Matches[5]
  }
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
Write-Host "==============================================" -ForegroundColor Green
Write-Host " SMARTVAHAN Deploy — $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

Assert-Path $ProjectRoot "Project root"
Assert-Path "$ProjectRoot\backend" "Backend folder"
Assert-Path "$ProjectRoot\frontend" "Frontend folder"

# ---------------------------------------------------------------------------
# 1. Backup
# ---------------------------------------------------------------------------
if (-not $SkipBackup) {
  Write-Step "1. Backup"
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

  $envFile = Join-Path $ProjectRoot "backend\.env"
  $db = Get-DbCredsFromEnv $envFile
  $pgDump = Get-PgDumpPath

  Write-Host "Using pg_dump: $pgDump"
  Write-Host "Dumping database '$($db.Database)' ..."

  $env:PGPASSWORD = $db.Password
  $dumpFile = Join-Path $BackupRoot "smartvahan_full.dump"
  $dumpLog  = Join-Path $BackupRoot "pg_dump_log.txt"

  & $pgDump -h $db.Host -p $db.Port -U $db.User -d $db.Database -F c -f $dumpFile -v 2>&1 |
    Tee-Object -FilePath $dumpLog

  $dumpItem = Get-Item $dumpFile -ErrorAction SilentlyContinue
  if (-not $dumpItem -or $dumpItem.Length -lt 1024) {
    throw "DB dump failed or is empty (0 KB). See $dumpLog"
  }
  Write-Host ("DB dump OK: {0:N0} bytes" -f $dumpItem.Length) -ForegroundColor Green

  if (Test-Path $IISPath) {
    Compress-Archive -Path (Join-Path $IISPath "*") -DestinationPath (Join-Path $BackupRoot "frontend_iis.zip") -Force
    Write-Host "IIS frontend backup saved."
  }

  $uploads = Join-Path $ProjectRoot "backend\uploads"
  if (Test-Path $uploads) {
    Compress-Archive -Path $uploads -DestinationPath (Join-Path $BackupRoot "uploads.zip") -Force
    Write-Host "Uploads backup saved."
  }

  Write-Host "Backup folder: $BackupRoot" -ForegroundColor Green
} else {
  Write-Step "1. Backup skipped (-SkipBackup)"
}

# ---------------------------------------------------------------------------
# 2. Git pull
# ---------------------------------------------------------------------------
if (-not $SkipGitPull) {
  Write-Step "2. Git pull ($GitBranch)"
  Set-Location $ProjectRoot
  git fetch --all
  git checkout $GitBranch
  git pull origin $GitBranch
  git log -1 --oneline
} else {
  Write-Step "2. Git pull skipped (-SkipGitPull)"
}

# ---------------------------------------------------------------------------
# 3. Backend
# ---------------------------------------------------------------------------
if (-not $FrontendOnly) {
  Write-Step "3. Backend build + PM2 restart"
  Set-Location (Join-Path $ProjectRoot "backend")

  npm install
  npx prisma generate
  # Include migrations when deploying schema/SLD changes:
  npx prisma migrate deploy
  npm run build

  $entry = $null
  if (Test-Path ".\dist\src\main.js") { $entry = "dist\src\main.js" }
  elseif (Test-Path ".\dist\main.js") { $entry = "dist\main.js" }
  else { throw "Backend build missing dist entry (dist\\src\\main.js or dist\\main.js)" }

  Write-Host "PM2 entry: $entry"

  $pm2Json = pm2 jlist 2>$null
  $hasProc = $false
  if ($pm2Json) {
    try {
      $list = $pm2Json | ConvertFrom-Json
      $hasProc = @($list | Where-Object { $_.name -eq $Pm2Name }).Count -gt 0
    } catch {
      $hasProc = $false
    }
  }

  if ($hasProc) {
    pm2 restart $Pm2Name
  } else {
    pm2 start $entry --name $Pm2Name
    pm2 save
  }

  pm2 status
  Write-Host "Backend restarted." -ForegroundColor Green
} else {
  Write-Step "3. Backend skipped (-FrontendOnly)"
}

# ---------------------------------------------------------------------------
# 4. Frontend
# ---------------------------------------------------------------------------
if (-not $BackendOnly) {
  Write-Step "4. Frontend build + IIS publish"
  Set-Location (Join-Path $ProjectRoot "frontend")

  npm install
  npm run build

  Assert-Path ".\dist\index.html" "Frontend build (dist\\index.html)"
  Assert-Path $IISPath "IIS site path"

  Copy-Item -Path ".\dist\*" -Destination $IISPath -Recurse -Force
  Write-Host "Frontend published to $IISPath" -ForegroundColor Green
} else {
  Write-Step "4. Frontend skipped (-BackendOnly)"
}

# ---------------------------------------------------------------------------
# 5. Verify
# ---------------------------------------------------------------------------
Write-Step "5. Quick verify"
try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/api" -UseBasicParsing -TimeoutSec 10
  Write-Host "API localhost responded: $($r.StatusCode)"
} catch {
  # Nest often returns 404 for /api root — still means server is up
  if ($_.Exception.Response) {
    Write-Host "API localhost responded: $([int]$_.Exception.Response.StatusCode) (OK if 404)" -ForegroundColor Yellow
  } else {
    Write-Warning "API check failed: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "Manual checks:"
Write-Host "  1) https://smartvahan.net/control — login"
Write-Host "  2) Dashboard: changing filters must NOT reload until Filter click"
Write-Host "  3) CG + 2026-01-01..2026-01-31 → C3/CT near 3179 / 4557 (not 2940 / 4229)"
Write-Host "Backup: $BackupRoot"
