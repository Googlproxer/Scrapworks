import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { test } from 'vitest';
import { compressBuild } from './compress.ts';

async function fixture(run: (directory: string) => Promise<void>) {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'scrapworks-brotli-'));
  try {
    await run(directory);
  } finally {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert(path.basename(resolved).startsWith('scrapworks-brotli-'));
    await fs.rm(resolved, { recursive: true });
  }
}

test('nested browser assets round-trip exactly and originals are preserved', async () =>
  fixture(async (directory) => {
    await fs.mkdir(path.join(directory, 'scene'));
    const assets = new Map([
      ['index.html', Buffer.from('<p>Loading Scrapworks…</p>'.repeat(100))],
      ['main.js', Buffer.from('export const ready = true;\n'.repeat(100))],
      ['worker.js', Buffer.from('postMessage({tick: 1});\n'.repeat(100))],
      ['styles.css', Buffer.from('body { color: white; }\n'.repeat(100))],
      [
        'scene/game.babylon',
        Buffer.from(JSON.stringify({ meshes: Array(100).fill({ name: 'mesh' }) })),
      ],
      ['scene/game.json', Buffer.from(JSON.stringify({ terrain: Array(100).fill('soil') }))],
      ['scene/model.glb', Buffer.alloc(2048, 1)],
      ['scene/physics.wasm', Buffer.alloc(2048, 2)],
    ]);
    for (const [name, bytes] of assets) await fs.writeFile(path.join(directory, name), bytes);
    const report = await compressBuild(directory);
    assert.equal(report.files, assets.size);
    assert(report.brotliBytes < report.originalBytes);
    for (const [name, bytes] of assets) {
      assert.deepEqual(await fs.readFile(path.join(directory, name)), bytes);
      assert.deepEqual(
        brotliDecompressSync(await fs.readFile(path.join(directory, name + '.br'))),
        bytes,
      );
    }
    const before = await fs.readFile(path.join(directory, 'main.js.br'));
    assert.deepEqual(await compressBuild(directory), report);
    assert.deepEqual(await fs.readFile(path.join(directory, 'main.js.br')), before);
    await fs.writeFile(
      path.join(directory, 'main.js'),
      'export const changed = true;\n'.repeat(100),
    );
    await compressBuild(directory);
    assert.deepEqual(
      brotliDecompressSync(await fs.readFile(path.join(directory, 'main.js.br'))),
      await fs.readFile(path.join(directory, 'main.js')),
    );
  }));

test('skips compressed media and removes a stale sidecar when compression would increase size', async () =>
  fixture(async (directory) => {
    for (const name of ['logo.webp', 'background.png', 'archive.gz', 'existing.js.br'])
      await fs.writeFile(path.join(directory, name), Buffer.alloc(2048, 1));
    await fs.writeFile(path.join(directory, 'empty.js'), '');
    await fs.writeFile(path.join(directory, 'empty.js.br'), 'stale');
    await fs.writeFile(path.join(directory, 'noise.bin'), randomBytes(4096));
    const report = await compressBuild(directory);
    assert.equal(report.files, 0);
    assert.deepEqual((await fs.readdir(directory)).sort(), [
      'archive.gz',
      'background.png',
      'empty.js',
      'existing.js.br',
      'logo.webp',
      'noise.bin',
    ]);
  }));

test('fails when build output is missing instead of reporting a successful empty build', async () =>
  fixture(async (directory) => {
    await assert.rejects(compressBuild(path.join(directory, 'missing')), { code: 'ENOENT' });
  }));
