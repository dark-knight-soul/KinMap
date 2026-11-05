#!/bin/sh
# Сборка KinMap в один файл dist/KinMap.html — его можно открыть двойным кликом без интернета.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Нужен Node.js 20 или новее / Node.js 20+ is required: https://nodejs.org"
  exit 1
fi

[ -d node_modules ] || npm install
npm run build

echo ""
echo "Готово / Done: $(pwd)/dist/KinMap.html"
