@echo off
rem Stream Helper: запуск из исходников.
rem Примеры: start.bat --demo, start.bat --bot-demo, start.bat --no-bot

cd /d "%~dp0.."
if not exist "node_modules\.bin\electron.cmd" (
  echo Stream Helper: зависимости не установлены.
  echo Выполните в корне проекта: npm install
  pause
  exit /b 1
)

set "ARGS=%*"
set "ARGS=%ARGS:--debug=--overlay-debug%"

start "" "node_modules\.bin\electron.cmd" . %ARGS%
exit /b 0
