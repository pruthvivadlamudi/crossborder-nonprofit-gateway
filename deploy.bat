@echo off
TITLE Render Deploy Now
COLOR 0A

echo ========================================================
echo   DYMCT & AOR Non-Profit Gateway
echo   Triggering Render Production Deployment Now
echo ========================================================
echo.

cd /d "%~dp0"
call npm run deploy %*
pause
