@echo off
rem Crux with the data kept on this laptop (study\data\study.json): the checked solutions made here and the files you
rem added from this laptop. "Crux (local).bat" opens your online data instead. AI work goes through Claude Code on
rem your Claude plan. Leave this window open while you use Crux; close it to stop.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
set CRUX_LIVE_DATA=
set CRUX_AI=claude-code
set PORT=5190
echo Building Crux...
call npm run build --silent || (echo The build failed. & pause & exit /b 1)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5190"
node server/index.js
pause
