@echo off
chcp 65001 >nul
cd /d "%~dp0"

call "%~dp0node-run.bat" src\check-config.js

echo.
pause
