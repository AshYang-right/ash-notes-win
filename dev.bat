@echo off
setlocal

cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

echo Starting AshNotes dev mode...
echo.
npm.cmd run app:dev

echo.
echo AshNotes dev mode exited.
pause
