@echo off
rem Crux on this computer, for you only: your real Crux data (the same as the website), with the AI work done by
rem Claude Code on your Claude plan instead of an API key. Leave this window open while you use Crux; close it to stop.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
where claude >nul 2>nul || (echo Claude Code isn't installed. Install it, run "claude" once to sign in, then try again. & pause & exit /b 1)
if not exist .env (echo No study\.env yet. Run setup-web.bat first. & pause & exit /b 1)
set CRUX_LIVE_DATA=1
set CRUX_AI=claude-code
set PORT=5180
echo Building Crux...
call npm run build --silent || (echo The build failed. & pause & exit /b 1)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5180"
node server/index.js
pause
