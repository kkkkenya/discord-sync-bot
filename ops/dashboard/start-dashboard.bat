@echo off
rem The Hub's local dashboard. Opens in your browser; close this window to stop it.
cd /d "%~dp0..\.."
node ops\dashboard\server.js
pause
