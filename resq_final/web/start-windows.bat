@echo off
REM Starts the RESQ.AI backend and the new web app together (Windows).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and try again. & pause & exit /b 1)
if not exist "..\node_modules" (echo Installing backend packages... & pushd .. & call npm install & popd)
echo Checking web app packages...
call npm install --no-audit --no-fund
if not exist ".env.local" copy ".env.example" ".env.local" >nul
start "RESQ.AI backend" cmd /k "cd /d %~dp0.. && node --import dotenv/config server.js"
echo Starting the web app. Your browser will open at http://localhost:5173
call npm run dev
pause
