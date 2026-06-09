@echo off
setlocal

cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

echo Building AshNotes release app...
echo.
npm.cmd run app:build
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build finished.
echo Release exe:
echo %~dp0src-tauri\target\release\ashnotes.exe
echo.
set /p OPEN_APP="Open release app now? [y/N] "
if /i "%OPEN_APP%"=="y" (
  start "" "%~dp0src-tauri\target\release\ashnotes.exe"
)

pause
