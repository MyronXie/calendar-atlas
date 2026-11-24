@echo off
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\desktop-app.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\desktop-app.ps1" -Action "%~1"
)
if not errorlevel 1 exit /b 0
if "%~1"=="" pause
exit /b 1
