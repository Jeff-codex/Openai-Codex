@echo off
setlocal
set "BASE=%~dp0"
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $base=[System.IO.Path]::GetFullPath('%BASE%'); $autoDir=Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -like '07_*AutomationScripts' } | Select-Object -First 1; if(-not $autoDir){ throw 'AutomationScripts dir not found'; }; $script=Join-Path $autoDir.FullName 'restart-checklist-win.ps1'; if(-not (Test-Path -LiteralPath $script)){ throw ('checklist script not found: ' + $script); }; & $script"
exit /b %errorlevel%