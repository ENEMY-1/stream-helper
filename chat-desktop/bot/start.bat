@echo off
rem Запускает приложение Stream Helper и сразу открывает панель бота.
rem Пример: start.bat --demo
setlocal
set "ARGS=%*"
if not "%ARGS%"=="" set "ARGS=%ARGS:--demo=--bot-demo%"

if exist "%~dp0..\..\..\..\Stream Helper.exe" (
  start "" "%~dp0..\..\..\..\Stream Helper.exe" --bot %ARGS%
  exit /b 0
)

call "%~dp0..\start.bat" --bot %ARGS%
