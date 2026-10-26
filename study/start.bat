@echo off
rem Starts the study dashboard and your study DMs, and restarts it if it stops. If it's already running,
rem it just opens the dashboard. The "Study Desk" shortcut (make-shortcut.ps1) runs this minimised.
title Study dashboard
cd /d "%~dp0"
set PORT=5190
if exist .env for /f "tokens=2 delims==" %%p in ('findstr /b "PORT=" .env') do set PORT=%%p
netstat -ano | findstr "127.0.0.1:%PORT% " | findstr LISTENING >nul && (start "" http://localhost:%PORT% & exit /b 0)
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
if not exist node_modules (echo Installing packages, one moment... & call npm install --no-fund --no-audit --loglevel=error)
if not exist .env (start "Study dashboard: setup" /wait cmd /c setup.bat)
call npx vite build --logLevel error
rem open the browser a few seconds in, once the server is listening
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start "" http://localhost:%PORT%"
:loop
node server/index.js
echo.
echo Stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
