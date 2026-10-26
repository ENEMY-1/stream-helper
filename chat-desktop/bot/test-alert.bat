@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "ALERT_ARGS=%*"
if "%ALERT_ARGS%"=="" set "ALERT_ARGS=--test"

call "%~dp0node-run.bat" src\stream-alerts.js %ALERT_ARGS%

echo.
pause
