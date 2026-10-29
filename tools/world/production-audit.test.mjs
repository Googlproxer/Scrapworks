import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMetadata } from '../ecs-bench/verify-production.mjs';
const fixture = () => ({
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
    'tools/simulation-worker-bench/production-fixture.ts',
    'node_modules/bitecs/dist/index.js',
  ]) {
    const m = fixture();
    m.outputs['view.js'].inputs[input] = {};
    assert.throws(() => verifyMetadata(m));
  }
  const m = fixture();
  m.outputs['main.js'].imports.push({ path: 'worker.js', kind: 'import-statement' });
  assert.throws(() => verifyMetadata(m), /main graph/);
  const n = fixture();
  n.outputs['worker.js'].inputs['src/game/views/player-view.ts'] = {};
  assert.throws(() => verifyMetadata(n), /Presentation/);
});
