@echo off
rem Double-click to add or change the bot's keys (Discord token, Supabase, Vercel). Saves them to pc\.env.
title Engineering Study Hub bot: key setup
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org, then run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing the bot's packages, one moment... & call npm install --no-fund --no-audit --loglevel=error)
node setup-keys.js
echo.
pause
