@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo [GameDream] Node.js 22+ was not found on PATH.
  echo Install it from https://nodejs.org/ and run this script again.
  echo.
  pause
  exit /b 1
)
node "%~dp0scripts\start.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" exit /b 0
echo.
echo [GameDream] Launcher failed with exit code %EXIT_CODE%.
echo Run it from a terminal for the full log: start.cmd
echo.
pause
exit /b %EXIT_CODE%
