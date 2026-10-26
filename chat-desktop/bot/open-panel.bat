@echo off
rem Открывает панель бота в приложении. Если приложение уже запущено,
rem второй экземпляр не создаётся — открывается панель.
setlocal

if exist "%~dp0..\..\..\..\Stream Helper.exe" (
  start "" "%~dp0..\..\..\..\Stream Helper.exe" --bot
  exit /b 0
)

call "%~dp0..\start.bat" --bot
