@echo off
chcp 65001 >nul
rem Сборка KinMap в один файл dist\KinMap.html — его можно открыть двойным кликом без интернета.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Нужен Node.js 20 или новее / Node.js 20+ is required: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Готово / Done: %~dp0dist\KinMap.html
pause
