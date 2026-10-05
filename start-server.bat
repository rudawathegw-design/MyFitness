@echo off
title MY FITNESS - ordering server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
echo.
echo  Starting the MY FITNESS ordering server ...
echo  Keep this window open while the cafe is working. Close it to stop the server.
echo.
node server\server.js --open %*
pause
exit /b 0
:nonode
echo.
echo  Node.js is not installed on this PC.
echo  1. Download the LTS version from https://nodejs.org  (opens now)
echo  2. Install it with the default options
echo  3. Double-click start-server.bat again
echo.
start "" "https://nodejs.org/en/download"
pause
