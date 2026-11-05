#!/usr/bin/env node
// Публикация онлайн-версии на GitHub Pages: dist/KinMap.html → ветка gh-pages (index.html).
// Запуск: npm run pages (сначала соберёт проект).
//
// Ветка gh-pages содержит только готовый файл и каждый раз перезаписывается одним коммитом —
// история сайта не нужна, исходники и их история — в main.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const built = join(root, 'dist', 'KinMap.html');
if (!existsSync(built)) {
  console.error('Нет dist/KinMap.html — сначала npm run build');
  process.exit(1);
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const remote = git(root, 'remote', 'get-url', 'origin');
// Автор — тот же, что в основном репозитории (анонимный адрес GitHub)
const name = git(root, 'config', 'user.name');
const email = git(root, 'config', 'user.email');

const tmp = mkdtempSync(join(tmpdir(), 'kinmap-pages-'));
try {
  copyFileSync(built, join(tmp, 'index.html'));
  // Без Jekyll: GitHub отдаёт файл как есть
  writeFileSync(join(tmp, '.nojekyll'), '');
  git(tmp, 'init', '-q', '-b', 'gh-pages');
  git(tmp, 'config', 'user.name', name);
  git(tmp, 'config', 'user.email', email);
  git(tmp, 'add', '-A');
  git(tmp, 'commit', '-q', '-m', `Онлайн-версия KinMap ${version}`);
  git(tmp, 'push', '-q', '--force', remote, 'gh-pages');
  console.log(`Опубликовано: версия ${version} → ветка gh-pages`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
