import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';
import { hash } from '../scenes/inventory.ts';

const root = path.resolve(import.meta.dirname, '../..');

/** Isolated CLI fixture: a tiny build stand-in, never an Angular build or gameplay route in CI. */
async function fixture(run: (directory: string) => Promise<void>) {
  const parent = path.join(root, 'tmp');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'portfolio-package-test-'));
  try {
    for (const name of [
      'tools/portfolio',
      'tools/scenes',
      'tools/build',
      'public',
      'src',
      'dist/scrapworks/browser',
    ])
      await fs.mkdir(path.join(directory, name), { recursive: true });
    for (const name of [
      'tools/portfolio/package.ts',
      'tools/portfolio/serve.ts',
      'tools/scenes/inventory.ts',
    ])
      await fs.copyFile(path.join(root, name), path.join(directory, name));
    for (const name of ['package.json', 'yarn.lock', 'angular.json'])
      await fs.writeFile(
        path.join(directory, name),
        name === 'package.json' ? '{"type":"module"}' : '{}',
      );
    await fs.writeFile(path.join(directory, 'src/main.ts'), 'export const current = true;');
    await fs.writeFile(
      path.join(directory, 'dist/scrapworks/browser/index.html'),
      '<p>Old build</p>',
    );
    await fs.writeFile(
      path.join(directory, 'dist/scrapworks/browser/retired.js'),
      'retired source',
    );
    await fs.writeFile(path.join(directory, 'dist/scrapworks/browser-stats.json'), '{}');
    await fs.writeFile(
      path.join(directory, 'tools/build/build.ts'),
      `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
assert(process.argv.includes('--stats-json'));
assert(process.argv.includes('--configuration') && process.argv.includes('production'));
const config = await fs.readFile('angular.json', 'utf8');
if (config.includes('failBuild')) throw new Error('Fixture build failed');
await fs.unlink('dist/scrapworks/browser/retired.js');
await fs.writeFile('dist/scrapworks/browser/index.html', '<p>Fresh build</p>');
await fs.cp('public', 'dist/scrapworks/browser', { recursive: true });
await fs.writeFile('dist/scrapworks/browser/config.json', config);
await fs.writeFile('dist/scrapworks/browser-stats.json', '{"fresh":true}');
`,
    );
    await run(directory);
  } finally {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), await fs.realpath(parent));
    assert(path.basename(resolved).startsWith('portfolio-package-test-'));
    await fs.rm(resolved, { recursive: true });
  }
}

test('packaging rebuilds changed public/config inputs and removes stale output before recording identity', async () =>
  fixture(async (directory) => {
    const config = '{"assetVersion":2}';
    await fs.writeFile(path.join(directory, 'public/current.json'), '{"version":2}');
    await fs.writeFile(path.join(directory, 'angular.json'), config);
    const result = spawnSync(process.execPath, ['tools/portfolio/package.ts'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout.trim().split(/\r?\n/).at(-1)!;
    assert.equal(path.dirname(output), path.join(directory, 'dist'));
    assert.equal(
      await fs.readFile(path.join(output, 'browser/current.json'), 'utf8'),
      '{"version":2}',
    );
    assert.equal(await fs.readFile(path.join(output, 'browser/config.json'), 'utf8'), config);
    assert.equal(
      await fs.readFile(path.join(output, 'browser-stats.json'), 'utf8'),
      '{"fresh":true}',
    );
    assert.equal(await fs.stat(path.join(output, 'browser/retired.js')).catch(() => null), null);
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8')) as {
      config: { path: string; sha256: string }[];
      files: { path: string; sha256: string }[];
    };
    assert.equal(
      manifest.config.find((entry) => entry.path === 'angular.json')?.sha256,
      hash(config),
    );
    assert.equal(
      manifest.files.find((entry) => entry.path === 'config.json')?.sha256,
      hash(config),
    );
  }));

test('a failed rebuild prevents packaging the previous artifact', async () =>
  fixture(async (directory) => {
    await fs.writeFile(path.join(directory, 'angular.json'), '{"failBuild":true}');
    const result = spawnSync(process.execPath, ['tools/portfolio/package.ts'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Fixture build failed/);
    assert.deepEqual(await fs.readdir(path.join(directory, 'dist')), ['scrapworks']);
  }));
