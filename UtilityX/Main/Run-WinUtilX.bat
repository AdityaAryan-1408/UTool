@echo off
title Ollumi Build and Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-UtilityX.ps1" %*
if errorlevel 1 pause
