@echo off
title MY FITNESS - print bridge (Xprinter XP-N200L)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
rem Only needed when the staff panel is opened from the internet (GitHub Pages / your domain).
rem When you use start-server.bat on this PC, the server prints by itself.
node server\print-bridge.js
pause
exit /b 0
:nonode
echo Node.js is not installed. Get the LTS version from https://nodejs.org and try again.
start "" "https://nodejs.org/en/download"
pause
