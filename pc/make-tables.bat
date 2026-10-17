@echo off
rem Double-click to create the bot's Supabase tables (asks for a Supabase access token, not saved).
title Engineering Study Hub bot: create tables
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org, then run this again. & pause & exit /b 1)
node make-tables.js
echo.
pause
