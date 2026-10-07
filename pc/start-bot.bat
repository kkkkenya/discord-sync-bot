@echo off
rem Starts the Engineering Study Hub PC bot and restarts it if it ever stops.
rem To start it with Windows: press Win+R, type shell:startup, and put a shortcut to this file there.
title Engineering Study Hub bot
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
if not exist node_modules (echo Installing the bot's packages, one moment... & call npm install --no-fund --no-audit --loglevel=error)
node setup-keys.js --check >nul || (echo Some keys are missing, so key setup opens first. & node setup-keys.js)
:loop
node src/index.js
echo.
echo Bot stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
