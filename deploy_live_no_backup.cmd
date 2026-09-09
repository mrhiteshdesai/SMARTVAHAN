@echo off
title SMARTVAHAN Deploy (no backup)
cd /d "%~dp0"

echo.
echo Running deploy_live_no_backup.ps1 ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_live_no_backup.ps1"
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% NEQ 0 (
  echo DEPLOY FAILED with exit code %EXITCODE%
) else (
  echo Script finished.
)
echo.
pause
exit /b %EXITCODE%
