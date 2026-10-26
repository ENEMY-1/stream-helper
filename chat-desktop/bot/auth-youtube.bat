@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ is required: https://nodejs.org
  pause
  exit /b 1
)

node src\auth-youtube.js

echo.
pause
