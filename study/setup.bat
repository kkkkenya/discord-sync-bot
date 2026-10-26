@echo off
rem Double-click to set your Discord user ID (who the bot DMs) and an optional Anthropic key. Saves study\.env.
title Study dashboard: setup
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org, then run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing packages, one moment... & call npm install --no-fund --no-audit --loglevel=error)
node setup.js
echo.
pause
