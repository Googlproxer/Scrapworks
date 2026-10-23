import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { compileMarkers } from './compile.mjs';
import { fixtureMarkers } from './test-fixture.mjs';
import { verifyWorldExport } from './verify-export.mjs';

async function fixture(run) {
  const temporary = fileURLToPath(new URL('../../tmp/', import.meta.url));
  await fs.mkdir(temporary, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporary, 'world-export-check-'));
  try {
    const nodes = fixtureMarkers();
    await fs.mkdir(path.join(root, 'assets/game.scene/nodes'), { recursive: true });
    for (const [index, node] of nodes.entries())
      await fs.writeFile(
        path.join(root, `assets/game.scene/nodes/${index}.json`),
        JSON.stringify(node),
      );
    await fs.mkdir(path.join(root, 'public/scene/worlds'), { recursive: true });
    await fs.writeFile(path.join(root, 'public/scene/assets-list.json'), '["worlds/game.json"]');
    const world = compileMarkers(nodes);
    const file = path.join(root, 'public/scene/worlds/game.json');
    await fs.writeFile(file, JSON.stringify(world));
    await run({ root, file, world });
  } finally {
    const resolved = await fs.realpath(root);
    if (
      path.dirname(resolved) !== path.resolve(temporary) ||
      !path.basename(resolved).startsWith('world-export-check-')
    )
      throw new Error('Unexpected world audit fixture cleanup path');
    await fs.rm(resolved, { recursive: true });
  }
}

test('requires the compiled world even when an older exporter omitted its manifest entry', () =>
  fixture(async ({ root, file, world }) => {
    assert.deepEqual(await verifyWorldExport(root), world);
    await fs.unlink(file);
    await fs.writeFile(path.join(root, 'public/scene/assets-list.json'), '[]');
    await assert.rejects(verifyWorldExport(root), { code: 'ENOENT' });
  }));

test('rejects stale, invalid or unregistered compiled worlds', () =>
  fixture(async ({ root, file, world }) => {
    await fs.writeFile(file, JSON.stringify({ ...world, version: 2 }));
    await assert.rejects(verifyWorldExport(root), /unsupported version/);
    const stale = structuredClone(world);
    stale.deposits[0].quantity++;
    await fs.writeFile(file, JSON.stringify(stale));
    await assert.rejects(verifyWorldExport(root), /differs from saved authored markers/);
    await fs.writeFile(file, JSON.stringify(world));
    await fs.writeFile(path.join(root, 'public/scene/assets-list.json'), '[]');
    await assert.rejects(verifyWorldExport(root), /absent from assets-list/);
  }));
