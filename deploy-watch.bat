@echo off
TITLE Render Live Real-Time Auto-Deploy Watcher
COLOR 0B

echo ========================================================
echo   DYMCT & AOR Non-Profit Gateway
echo   Render Real-Time Live Auto-Deploy Watcher
echo ========================================================
echo.
echo Watching for code changes in src/...
echo As soon as you save any file, it will automatically
echo test the build, commit, and push to GitHub, triggering
echo an instant real-time deployment on Render!
echo.
echo Live Site: https://dymct-aor-gateway.onrender.com
echo.

cd /d "%~dp0"
call npm run deploy:watch
pause
