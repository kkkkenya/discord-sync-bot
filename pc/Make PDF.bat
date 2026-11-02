@echo off
rem Make PDF: drag photos, PDFs, PowerPoint or Word files (or a folder) onto this file or its desktop shortcut.
rem They become one PDF next to the first file. Nothing is posted anywhere.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js isn't installed. Get the LTS version from nodejs.org. & pause & exit /b 1)
node make-pdf.js %*
echo.
pause
