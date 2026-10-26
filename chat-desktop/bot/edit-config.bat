@echo off
chcp 65001 >nul
cd /d "%~dp0"

start "config.js" notepad.exe "%~dp0config.js"
