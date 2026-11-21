@echo off
cd /d "%~dp0"
echo Cleaning atlas-data\calendar.ics (removing X-ALT-DESC HTML)...
node "%~dp0clean-calendar.mjs" --write
if errorlevel 1 (
  echo Cleaning failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Done. If the calendar page is open, click Refresh to reload.
pause
