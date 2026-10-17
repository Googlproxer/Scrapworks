import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localPath, retainSceneAssets } from './retain-assets.mjs';

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scrapworks-export-test-'));
  try {
    await fs.mkdir(path.join(root, 'assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'game.babylon'), '{}');
    await fs.writeFile(path.join(root, 'assets/used.png'), 'used');
    await fs.writeFile(path.join(root, 'assets/library.png'), 'original library copy');
    await fs.writeFile(path.join(root, 'assets/dynamic.ogg'), 'dynamic sound');
    await fs.writeFile(path.join(root, 'geometry.bin'), 'geometry');
    await fs.writeFile(path.join(root, 'scenes-used-files.json'), JSON.stringify({ 'game.scene': ['game.babylon', 'assets/used.png', 'geometry.bin'] }));
    await run(root);
  } finally {
    const resolved = await fs.realpath(root);
    if (path.dirname(resolved) !== (await fs.realpath(os.tmpdir())) || !path.basename(resolved).startsWith('scrapworks-export-test-'))
      throw new Error('Unexpected test cleanup path');
    await fs.rm(resolved, { recursive: true });
  }
}

test('keeps scene geometry, textures and explicitly declared dynamic assets, without shipping library copies', async () =>
  fixture(async (root) => {
    const report = await retainSceneAssets(root, { version: 1, additionalSceneAssets: ['assets/dynamic.ogg'] });
    assert.equal(report.removedFiles, 1);
    assert.equal(await fs.readFile(path.join(root, 'geometry.bin'), 'utf8'), 'geometry');
    assert.equal(await fs.readFile(path.join(root, 'assets/dynamic.ogg'), 'utf8'), 'dynamic sound');
    await assert.rejects(fs.access(path.join(root, 'assets/library.png')));
    const list = JSON.parse(await fs.readFile(path.join(root, 'assets-list.json'), 'utf8'));
    assert.ok(list.includes('assets/used.png'));
    assert.ok(!list.includes('assets/library.png'));
  }));

test('a missing declared dependency fails before deleting any library output', async () =>
  fixture(async (root) => {
    await assert.rejects(retainSceneAssets(root, { version: 1, additionalSceneAssets: ['assets/missing.png'] }), /absent/);
    assert.equal(await fs.readFile(path.join(root, 'assets/library.png'), 'utf8'), 'original library copy');
  }));

test('rejects paths that could address source files or escape the export', () => {
  for (const name of [
    '../assets/original.png',
    '/assets/original.png',
    'C:/original.png',
    'assets/../../original.png',
    'assets\\original.png',
    './assets/original.png',
    'assets//original.png',
  ])
    assert.throws(() => localPath(os.tmpdir(), name));
});

test('a newly authored scene dependency is retained automatically on the next export', async () =>
  fixture(async (root) => {
    await fs.writeFile(
      path.join(root, 'scenes-used-files.json'),
      JSON.stringify({ 'game.scene': ['game.babylon', 'assets/used.png', 'assets/library.png', 'geometry.bin'] }),
    );
    const report = await retainSceneAssets(root, { version: 1, additionalSceneAssets: [] });
    assert.equal(await fs.readFile(path.join(root, 'assets/library.png'), 'utf8'), 'original library copy');
    assert.ok(report.removed.every((file) => file.path !== 'assets/library.png'));
  }));
