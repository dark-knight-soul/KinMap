#!/bin/sh
# Запуск KinMap для разработки на macOS/Linux: ставит зависимости (один раз) и открывает браузер.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Нужен Node.js 20 или новее / Node.js 20+ is required: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Устанавливаю зависимости / Installing dependencies..."
  npm install
fi

npm run dev -- --open
