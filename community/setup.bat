@echo off
rem Double-click to add or change the community bot's keys (Discord token, Gemini key).
title Community bot: key setup
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. & pause & exit /b 1)
if not exist node_modules (echo Installing packages, one moment... & call npm install --no-fund --no-audit --loglevel=error)
node setup-keys.js
echo.
pause
