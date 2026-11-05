import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// После сборки переименовываем dist/index.html в dist/KinMap.html —
// именно этот один файл пользователи скачивают и открывают двойным кликом.
function renameOutput(): Plugin {
  return {
    name: 'kinmap-rename-output',
    apply: 'build',
    closeBundle() {
      const from = resolve(import.meta.dirname, 'dist/index.html');
      if (existsSync(from)) renameSync(from, resolve(import.meta.dirname, 'dist/KinMap.html'));
    },
  };
}

export default defineConfig({
  // Относительные пути, чтобы файл работал при открытии с диска (file://)
  base: './',
  plugins: [react(), viteSingleFile(), renameOutput()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
