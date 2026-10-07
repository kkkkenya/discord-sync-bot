@echo off
rem Lists duplicate copies the bot posted and deletes them only if you type y. Also gives #to-sort files
rem that lost their note their Sort buttons back.
title Engineering Study Hub bot: fix duplicates
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. & pause & exit /b 1)
node fix-duplicates.js
echo.
pause
