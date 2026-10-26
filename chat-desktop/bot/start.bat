@echo off
rem Чат-бот теперь встроен в приложение «Stream Helper — чат и бот».
rem Этот файл оставлен для привычки: он запускает приложение и открывает
rem панель бота. Отдельная консоль и node.exe больше не нужны.
rem
rem Демо-режим бота: start.bat --demo

setlocal
set "ARGS=%*"
if not "%ARGS%"=="" set "ARGS=%ARGS:--demo=--bot-demo%"
call "%~dp0..\start.bat" --bot %ARGS%
endlocal
