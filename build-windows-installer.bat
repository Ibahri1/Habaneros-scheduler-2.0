@echo off
setlocal
cd /d "%~dp0"
echo Checking Node.js...
node --version
if errorlevel 1 goto missingnode
echo Installing dependencies...
call npm install
if errorlevel 1 goto failed
echo Building Windows installer and portable app...
call npm run dist
if errorlevel 1 goto failed
echo.
echo Done. Check the release folder.
pause
exit /b 0
:missingnode
echo Node.js is required. Install Node.js 20 LTS or 22 LTS, then run this again.
pause
exit /b 1
:failed
echo.
echo Build failed. Read the messages above.
pause
exit /b 1
