@echo off
title MY FITNESS - DEMO server (sample sales + demo logins)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
rem Demo data is kept in a separate folder so it never mixes with real orders.
set "DATA_DIR=%~dp0data-demo"
node server\server.js --demo --open %*
pause
exit /b 0
:nonode
echo Node.js is not installed. Get the LTS version from https://nodejs.org and try again.
start "" "https://nodejs.org/en/download"
pause
