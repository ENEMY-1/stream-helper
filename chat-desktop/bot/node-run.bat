@echo off
rem Запускает js-скрипт бота без отдельной установки Node.js.
rem В установленном приложении используется встроенный Electron,
rem в исходниках — Electron из node_modules, и только потом node из PATH.
setlocal
cd /d "%~dp0"

set "NODE_EXE="

rem Установленное приложение: ...\Stream Helper\resources\app\chat-desktop\bot
if exist "%~dp0..\..\..\..\Stream Helper.exe" (
  set "NODE_EXE=%~dp0..\..\..\..\Stream Helper.exe"
)

rem Запуск из исходников: <проект>\chat-desktop\bot
if not defined NODE_EXE if exist "%~dp0..\..\node_modules\electron\dist\electron.exe" (
  set "NODE_EXE=%~dp0..\..\node_modules\electron\dist\electron.exe"
)

if defined NODE_EXE (
  set "ELECTRON_RUN_AS_NODE=1"
  "%NODE_EXE%" %*
  exit /b %errorlevel%
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required: https://nodejs.org
  exit /b 1
)

node %*
exit /b %errorlevel%
