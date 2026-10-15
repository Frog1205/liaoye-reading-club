@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-Liaoye.ps1"
if errorlevel 1 pause
