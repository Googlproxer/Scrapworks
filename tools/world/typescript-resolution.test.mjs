import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Node source imports follow tsconfig aliases independently of cwd and preserve native resolution', async () => {
  const temporaryDirectory = new URL('../../tmp/', import.meta.url);
  await fs.mkdir(temporaryDirectory, { recursive: true });
  const parent = await fs.realpath(temporaryDirectory);
  const root = await fs.mkdtemp(path.join(parent, 'typescript resolution '));
  try {
    await fs.writeFile(path.join(root, 'relative-value.ts'), 'export const value: number = 42;\n');
    await fs.writeFile(path.join(root, 'native-value.mjs'), 'export const value = 7;\n');
    await fs.writeFile(path.join(root, 'types-only.d.ts'), 'export interface TypesOnly {}\n');
    await fs.writeFile(
      path.join(root, 'alias probe.ts'),
      `import assert from 'node:assert/strict';
import ts from 'typescript';
import { GameSession } from '@app/features/game/session/game-session';
import { assertWorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { FrameClock } from '@game/timing/frame-clock';
import { Simulation } from '@simulation/simulation';
import { value } from './relative-value';
import { value as nativeValue } from './native-value.mjs';

assert.equal(typeof GameSession, 'function');
assert.equal(typeof assertWorldDefinition, 'function');
assert.equal(typeof cellCenter, 'function');
// Resolve browser configuration without executing its application-only imports.
assert.match(import.meta.resolve('@environments/environment'), /\\/src\\/environments\\/environment\\.ts$/);
assert.equal(new FrameClock().sample(100), 0);
assert.equal(typeof Simulation, 'function');
assert.equal(value, 42);
assert.equal(nativeValue, 7);
assert.equal(typeof ts.resolveModuleName, 'function');
await assert.rejects(import('@simulation/does-not-exist'), { code: 'ERR_MODULE_NOT_FOUND' });
await assert.rejects(import('./types-only'), { code: 'ERR_MODULE_NOT_FOUND' });
console.log('TypeScript source resolution passed');
`,
    );

    const output = execFileSync(
      process.execPath,
      ['--import', new URL('./register-typescript.mjs', import.meta.url).href, 'alias probe.ts'],
      { cwd: root, encoding: 'utf8', timeout: 15000 },
    );
    assert.match(output, /TypeScript source resolution passed/);
  } finally {
    const resolved = await fs.realpath(root);
    const relative = path.relative(parent, resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
