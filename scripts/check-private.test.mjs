import { describe, expect, it } from 'vitest';
import { findPrivateFiles } from './check-private.mjs';

describe('проверка личных данных перед коммитом', () => {
  it('ловит файлы древа и фото в обычных папках', () => {
    const found = findPrivateFiles(['family.kinmap', 'export/My Tree.GED', 'photos/babushka.jpg', 'scan.PDF']);
    expect(found.map((f) => f.path)).toEqual([
      'family.kinmap',
      'export/My Tree.GED',
      'photos/babushka.jpg',
      'scan.PDF',
    ]);
  });

  it('пропускает код и разрешённые папки', () => {
    expect(
      findPrivateFiles([
        'src/App.tsx',
        'examples/demo.kinmap',
        'test-data/gedcom/sample.ged',
        'docs/screenshot.png',
        'src\\assets\\logo.png',
      ]),
    ).toEqual([]);
  });
});
