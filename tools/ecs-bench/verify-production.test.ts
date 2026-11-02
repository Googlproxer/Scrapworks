import { test } from 'vitest';
import assert from 'node:assert/strict';
import { verifyMetadata } from './verify-production.ts';
import type { BuildMetadata } from '../shared.ts';

const fixture = (): BuildMetadata => ({
  outputs: {
    'main.js': {
      entryPoint: 'src/main.ts',
      imports: [{ path: 'view.js', kind: 'dynamic-import' }],
      inputs: { 'src/main.ts': {} },
    },
    'view.js': { inputs: { 'src/session/game-session.ts': {} } },
    'worker.js': {
      entryPoint: 'src/workers/simulation.worker.ts',
      inputs: { 'node_modules/miniplex/dist/miniplex.esm.js': {} },
    },
  },
});

test('production graph permits Miniplex only in its independent worker', () => {
  assert(verifyMetadata(fixture()).worker === 'worker.js');
  for (const input of [
    'node_modules/miniplex/dist/index.js',
    'src/session/inline-port.ts',
    'src/session/game-session.test.ts',
    'src/simulation/physics/world-physics.test.ts',
    'src/game/views/world-scene.spec.ts',
    'node_modules/vitest/dist/index.js',
    'node_modules/@vitest/runner/dist/index.js',
    'tools/simulation-worker-bench/production-fixture.ts',
    'node_modules/bitecs/dist/index.js',
    'src/game/debug/draw/development-renderer.ts',
    'src/game/debug/draw/geometry.ts',
    'src/game/debug/draw/backend.development.ts',
    'src/simulation/physics/world-physics.ts',
    'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs',
  ]) {
    const m = fixture();
    m.outputs['view.js'].inputs![input] = {};
    assert.throws(() => verifyMetadata(m));
  }
  const m = fixture();
  m.outputs['main.js'].imports!.push({ path: 'worker.js', kind: 'import-statement' });
  assert.throws(() => verifyMetadata(m), /main graph/);
  const n = fixture();
  n.outputs['worker.js'].inputs!['src/game/views/player-view.ts'] = {};
  assert.throws(() => verifyMetadata(n), /Presentation/);
  const reactiveWorker = fixture();
  reactiveWorker.outputs['worker.js'].inputs!['node_modules/rxjs/dist/esm/index.js'] = {};
  assert.throws(() => verifyMetadata(reactiveWorker), /RxJS entered simulation worker/);
});

test('async worker chunks remain worker-owned and a real main import still fails', () => {
  const metadata = fixture();
  metadata.outputs['worker.js'].imports = [{ path: 'worker-runtime.js', kind: 'dynamic-import' }];
  metadata.outputs['worker-runtime.js'] = {
    entryPoint: 'src/session/runtime.ts',
    inputs: {
      'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs': {},
      'src/simulation/physics/world-physics.ts': {},
    },
  };
  assert.equal(verifyMetadata(metadata).worker, 'worker.js');
  metadata.outputs['view.js'].imports = [{ path: 'worker-runtime.js', kind: 'dynamic-import' }];
  assert.throws(() => verifyMetadata(metadata), /Physics authority entered main/);
});
