@echo off
rem ================================================================
rem  MY FITNESS - kitchen / cashier screen
rem  Opens the kitchen screen in its own Chrome (or Edge) window that
rem  prints tickets silently (no print dialog) and plays sound alerts
rem  without a click. Make the Xprinter the Windows DEFAULT printer.
rem
rem  Change URL if the server runs on another PC, for example
rem    http://192.168.1.47:8080/admin/#/kitchen
rem  or the online version
rem    https://rudawathegw-design.github.io/MyFitness/admin/#/kitchen
rem ================================================================
set "URL=http://localhost:8080/admin/#/kitchen"
set "PROFILE=%LOCALAPPDATA%\MyFitnessKitchen"
set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" goto nobrowser
start "" "%BROWSER%" --kiosk-printing --autoplay-policy=no-user-gesture-required --user-data-dir="%PROFILE%" --start-maximized --app="%URL%"
exit /b 0
:nobrowser
echo Google Chrome or Microsoft Edge was not found on this PC.
pause
