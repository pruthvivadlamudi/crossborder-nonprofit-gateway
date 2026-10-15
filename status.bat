@echo off
TITLE DYMCT & AOR Gateway - Status Dashboard
COLOR 0B
cd /d "%~dp0"
call npm run status
pause
