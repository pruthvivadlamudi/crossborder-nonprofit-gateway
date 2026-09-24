@echo off
TITLE FinTech Cross-Border Non-Profit Engine
COLOR 0A

echo ========================================================
echo   Cross-Border Donation & FCRA Compliance Platform
echo   Multi-Trust Regulatory Gateway Engine
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js from https://nodejs.org and rerun this script.
    pause
    exit /b
)

echo [2/3] Checking dependencies...
if not exist "node_modules\" (
    echo Installing required project packages...
    call npm install
)

echo [3/3] Starting Local Server on http://localhost:3000 ...
start "" "http://localhost:3000"

call npm run dev
pause
