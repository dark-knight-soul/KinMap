#!/usr/bin/env node
// Проверка перед коммитом: не даёт случайно закоммитить настоящие древа и семейные фото.
// Запускается git-хуком .githooks/pre-commit (подключается автоматически при npm install).
// Обойти можно только осознанно: git commit --no-verify.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Файлы древа: свой формат и GEDCOM
const TREE_FILE = /\.(kinmap|ged|gedcom)$/i;
// Фото и сканы документов
const PHOTO_FILE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?|pdf)$/i;

// Папки, где разрешены выдуманные примеры и картинки для документации
const ALLOWED_DIRS = ['examples/', 'test-data/', 'docs/', 'src/assets/', 'public/'];

/** Возвращает список запрещённых файлов с причиной */
export function findPrivateFiles(paths) {
  const problems = [];
  for (const raw of paths) {
    const path = raw.replace(/\\/g, '/');
    if (ALLOWED_DIRS.some((dir) => path.startsWith(dir))) continue;
    if (TREE_FILE.test(path)) problems.push({ path, reason: 'файл древа / tree file' });
    else if (PHOTO_FILE.test(path)) problems.push({ path, reason: 'фото или документ / photo or document' });
  }
  return problems;
}

function stagedFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean);
}

// Запуск как скрипта (а не импорт из теста)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = findPrivateFiles(stagedFiles());
  if (problems.length > 0) {
    console.error('\n⛔ Похоже, в коммит попали личные данные / Possible personal data in commit:\n');
    for (const p of problems) console.error(`   ${p.path}  —  ${p.reason}`);
    console.error(
      `\nВыдуманные примеры кладите в: ${ALLOWED_DIRS.join(', ')}` +
        '\nУбрать файл из коммита: git restore --staged <файл>\n',
    );
    process.exit(1);
  }
}
