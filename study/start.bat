@echo off
rem Starts the study dashboard (http://localhost:5190) and your study DMs. Restarts if it stops.
rem To start it with Windows: Win+R, shell:startup, put a shortcut to this file there.
title Study dashboard
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
if not exist node_modules (echo Installing packages, one moment... & call npm install --no-fund --no-audit --loglevel=error)
if not exist .env (echo First run: setup opens first. & node setup.js)
call npx vite build --logLevel error
start "" http://localhost:5190
:loop
node server/index.js
echo.
echo Stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
