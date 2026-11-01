@echo off
rem Copies the daily-post keys into the GitHub repo's Actions secrets (needs gh auth login once).
cd /d "%~dp0"
node push-secrets.js
pause
