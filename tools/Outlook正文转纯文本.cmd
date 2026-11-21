@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================================
echo  Convert FAT Outlook appointment bodies to plain text
echo  (removes the Word/HTML X-ALT-DESC bloat from ICS exports)
echo  Chinese-Outlook only. First a dry-run preview, then confirm.
echo ================================================================
echo.
echo [1/2] Preview candidates (no changes yet)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook-plaintext.ps1"
if errorlevel 1 (
  echo Preview failed. See the error above.
  pause
  exit /b 1
)
echo.
choice /c YN /m "Convert the listed candidates to plain text now (modifies Outlook)"
if not errorlevel 1 goto end
if errorlevel 2 goto end
echo.
echo [2/2] Converting...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook-plaintext.ps1" -Apply
:end
echo.
pause
