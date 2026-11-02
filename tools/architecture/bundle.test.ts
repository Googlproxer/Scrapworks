import { test } from 'vitest';
import assert from 'node:assert/strict';
import { gameRouteBytes } from './bundle.ts';

test('route budget counts shared static chunks once and excludes dynamic imports and worker URLs', () => {
  assert.equal(
    gameRouteBytes({
      outputs: {
        'route.js': {
          bytes: 100,
          entryPoint: 'src/app/features/game/game-page/game-page.component.ts',
          imports: [
            { path: 'a.js', kind: 'import-statement' },
            { path: 'b.js', kind: 'import-statement' },
            { path: 'diagnostic.js', kind: 'dynamic-import' },
            { path: 'worker.js', kind: 'url-token' },
          ],
        },
        'a.js': { bytes: 20, imports: [{ path: 'shared.js', kind: 'import-statement' }] },
        'b.js': { bytes: 30, imports: [{ path: 'shared.js', kind: 'import-statement' }] },
        'shared.js': { bytes: 40 },
        'diagnostic.js': { bytes: 1000 },
        'worker.js': { bytes: 1000 },
      },
    }),
    190,
  );
});
