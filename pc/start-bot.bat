@echo off
rem Starts the Engineering Study Hub PC bot and restarts it if it ever stops.
rem To start it with Windows: press Win+R, type shell:startup, and put a shortcut to this file there.
title Engineering Study Hub bot
cd /d "%~dp0"
:loop
node src/index.js
echo.
echo Bot stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
