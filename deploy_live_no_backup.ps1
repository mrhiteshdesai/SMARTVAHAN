<#
.SYNOPSIS
  SMARTVAHAN live EC2 deploy — NO BACKUP

.DESCRIPTION
  Run as Administrator on the live Windows EC2 server.
  Pulls latest main, builds backend + frontend, restarts PM2, publishes IIS.
  Does NOT create DB/code/IIS backups.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy_live_no_backup.ps1

.EXAMPLE
  .\deploy_live_no_backup.ps1 -BackendOnly
  .\deploy_live_no_backup.ps1 -FrontendOnly
  .\deploy_live_no_backup.ps1 -SkipGitPull
#>

param(
  [switch]$SkipGitPull,
  [switch]$BackendOnly,
  [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
trap {
  Write-Host ""
  Write-Host "ERROR: $_" -ForegroundColor Red
  Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
  Write-Host ""
  if ($Host.Name -eq "ConsoleHost") {
    Read-Host "Press Enter to close"
  }
  exit 1
}

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
$ProjectRoot = "C:\smartvahan-src\SMARTVAHAN"
$IISPath     = "C:\inetpub\wwwroot\SMARTVAHAN"
$Pm2Name     = "smartvahan-backend"
$GitBranch   = "main"

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host ">>> $msg" -ForegroundColor Cyan
}

function Assert-Path([string]$path, [string]$label) {
  if (-not (Test-Path $path)) { throw "$label not found: $path" }
}

Write-Host "==============================================" -ForegroundColor Green
Write-Host " SMARTVAHAN Deploy (NO BACKUP) — $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

Assert-Path $ProjectRoot "Project root"
Assert-Path "$ProjectRoot\backend" "Backend folder"
Assert-Path "$ProjectRoot\frontend" "Frontend folder"

# ---------------------------------------------------------------------------
# 1. Git pull
# ---------------------------------------------------------------------------
if (-not $SkipGitPull) {
  Write-Step "1. Git pull ($GitBranch)"
  Set-Location $ProjectRoot
  git fetch --all
  git checkout $GitBranch
  git pull origin $GitBranch
  git log -1 --oneline
} else {
  Write-Step "1. Git pull skipped (-SkipGitPull)"
}

# ---------------------------------------------------------------------------
# 2. Backend
# ---------------------------------------------------------------------------
if (-not $FrontendOnly) {
  Write-Step "2. Backend build + PM2 restart"
  Set-Location (Join-Path $ProjectRoot "backend")

  npm install
  npx prisma generate
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
    } catch { $hasProc = $false }
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
  Write-Step "2. Backend skipped (-FrontendOnly)"
}

# ---------------------------------------------------------------------------
# 3. Frontend
# ---------------------------------------------------------------------------
if (-not $BackendOnly) {
  Write-Step "3. Frontend build + IIS publish"
  Set-Location (Join-Path $ProjectRoot "frontend")

  npm install
  npm run build

  Assert-Path ".\dist\index.html" "Frontend build (dist\\index.html)"
  Assert-Path $IISPath "IIS site path"

  Copy-Item -Path ".\dist\*" -Destination $IISPath -Recurse -Force
  Write-Host "Frontend published to $IISPath" -ForegroundColor Green
} else {
  Write-Step "3. Frontend skipped (-BackendOnly)"
}

# ---------------------------------------------------------------------------
# 4. Verify
# ---------------------------------------------------------------------------
Write-Step "4. Quick verify"
try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/api" -UseBasicParsing -TimeoutSec 10
  Write-Host "API localhost responded: $($r.StatusCode)"
} catch {
  if ($_.Exception.Response) {
    Write-Host "API localhost responded: $([int]$_.Exception.Response.StatusCode) (OK if 404)" -ForegroundColor Yellow
  } else {
    Write-Warning "API check failed: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " DEPLOY COMPLETE (no backup taken)" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "Checks:"
Write-Host "  1) https://smartvahan.net/control — login"
Write-Host "  2) Dashboard Filter button applies filters only on click"
Write-Host "  3) CG 2026-01-01..2026-01-31 → C3/CT near 3179 / 4557"

# Keep window open when launched by double-click / temporary console
if ($Host.Name -eq "ConsoleHost") {
  Write-Host ""
  Read-Host "Press Enter to close"
}
