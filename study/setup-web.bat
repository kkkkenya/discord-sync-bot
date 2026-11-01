@echo off
rem Crux setup: keys, Supabase tables, Vercel. Safe to run again; Enter keeps a saved value.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
node setup-web.js
pause
