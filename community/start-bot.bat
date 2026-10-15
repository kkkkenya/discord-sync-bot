@echo off
rem Starts the community bot and restarts it if it stops. It also starts with Windows (Startup shortcut).
title Engineering Study Hub community bot
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. & pause & exit /b 1)
if not exist node_modules (call npm install --no-fund --no-audit --loglevel=error)
node setup-keys.js --check >nul || (echo Keys are missing, so key setup opens first. & node setup-keys.js)
:loop
node src/index.js
echo Bot stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
