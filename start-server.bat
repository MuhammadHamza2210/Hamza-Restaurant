@echo off
REM ============================================================
REM  Zaiqa - one-click start
REM  Double-click this file to launch your website + database.
REM  Customer site:  http://localhost:5000
REM  Admin panel:    http://localhost:5000/admin.html
REM ============================================================
cd /d "%~dp0"

echo Starting Smart Ordering server...
echo.

REM Install dependencies the first time only
if not exist "node_modules" (
    echo First run: installing dependencies, please wait...
    call npm install
    echo.
)

REM Open the site in the default browser, then start the server
start "" "http://localhost:5000"
node server.js

echo.
echo Server stopped. Press any key to close.
pause >nul
