@echo off
chcp 65001 >nul
rem Запуск KinMap для разработки на Windows: ставит зависимости (один раз) и открывает браузер.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Нужен Node.js 20 или новее / Node.js 20+ is required: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Устанавливаю зависимости / Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run dev -- --open
