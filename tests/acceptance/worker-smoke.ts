/** Bounded CI fixture: real built module worker/WASM, without the application or renderer. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import type { RuntimeReply, RuntimeRequestBody } from '../../src/contracts/simulation.ts';
import { SIMULATION_WARMUP } from '../../src/contracts/worker-bootstrap.ts';
import { staticPreview } from '../../tools/portfolio/serve.ts';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';
import { worldFixture } from '../support/world-fixture.ts';

const root = path.resolve(import.meta.dirname, '../..');
const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const entries = Object.entries(metadata.outputs).filter(
  ([, output]) => output.entryPoint?.replaceAll('\\', '/') === 'src/workers/simulation.worker.ts',
);
assert.equal(entries.length, 1, 'Expected exactly one built simulation worker');
const server = staticPreview(path.join(root, 'dist/scrapworks/browser'));
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let watchdog: ReturnType<typeof setTimeout> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  // Keep the real same-origin worker/CSP path while avoiding Angular and WebGL.
  await page.route('**/__worker-smoke', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy': "worker-src 'self'; object-src 'none'; base-uri 'self'",
      },
      body: '<!doctype html><title>Built worker fixture</title>',
    }),
  );
  await page.goto(origin + '/__worker-smoke');
  const result = await Promise.race([
    page.evaluate(
      async ({ workerUrl, definition, warmup }) => {
        const worker = new Worker(workerUrl, { type: 'module' });
        let id = 0;
        function check(condition: unknown, message: string): asserts condition {
          if (!condition) throw new Error(message);
        }
        function exchange<T>(message: unknown, accepts: (data: T) => boolean): Promise<T> {
          return new Promise((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              worker.removeEventListener('message', receive);
              worker.removeEventListener('error', fail);
              worker.removeEventListener('messageerror', decodeFailure);
            };
            const receive = (event: MessageEvent<T>) => {
              if (!accepts(event.data)) return;
              cleanup();
              resolve(event.data);
            };
            const fail = (event: ErrorEvent) => {
              event.preventDefault();
              cleanup();
              reject(new Error(event.message));
            };
            const decodeFailure = () => {
              cleanup();
              reject(new Error('Worker message could not be decoded'));
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error('Built worker fixture reply timed out'));
            }, 5000);
            worker.addEventListener('message', receive);
            worker.addEventListener('error', fail);
            worker.addEventListener('messageerror', decodeFailure);
            worker.postMessage(message);
          });
        }
        const request = async (body: RuntimeRequestBody, generation = 1, revision = 0) => {
          const nextId = ++id;
          const reply = await exchange<RuntimeReply>(
            { protocol: 2, id: nextId, generation, revision, ...body },
            (data) => data.id === nextId,
          );
          check(reply.ok, `Worker ${body.operation} failed: ${reply.error}`);
          check(reply.protocol === 2 && reply.generation === generation, 'Wrong reply envelope');
          return reply;
        };
        try {
          await exchange<{ kind: string; version: number }>(
            warmup,
            (data) => data.kind === 'simulation-ready' && data.version === 1,
          );
          const initial = await request({ operation: 'initialize', definition });
          check(initial.packet?.rows instanceof ArrayBuffer, 'Missing transferred rows');
          check(initial.packet.rows.byteLength > 0, 'Empty transferred rows');
          const moved = await request({
            operation: 'advance',
            steps: 2,
            input: { x: 0, z: 1, sprint: false },
            inputSequence: 1,
          });
          const beforePause = await request({ operation: 'capture' });
          await request({ operation: 'activity', active: false }, 1, 1);
          const paused = await request({ operation: 'advance', steps: 2 }, 1, 1);
          const captured = await request({ operation: 'capture' }, 1, 1);
          check(captured.capture, 'Missing paused capture');
          await request({ operation: 'initialize', definition, capture: captured.capture }, 2);
          const restored = await request({ operation: 'capture' }, 2);
          await request({ operation: 'dispose' }, 2);
          return {
            initialTick: initial.packet.tick,
            completed: moved.completedTicks,
            beforePause: beforePause.capture?.world,
            pausedTicks: paused.completedTicks,
            captured: captured.capture,
            restored: restored.capture,
          };
        } finally {
          worker.terminate();
        }
      },
      {
        workerUrl: '/' + path.posix.basename(entries[0][0]),
        definition: worldFixture(),
        warmup: SIMULATION_WARMUP,
      },
    ),
    new Promise<never>((_, reject) => {
      watchdog = setTimeout(
        () => reject(new Error('Built worker smoke exceeded 30 seconds')),
        30000,
      );
    }),
  ]);
  assert.deepEqual(result.completed, [result.initialTick + 1, result.initialTick + 2]);
  assert.equal(result.beforePause?.resources.tick, result.initialTick + 2);
  const player = result.beforePause?.entities.find((entity) => entity.kind === 'player');
  assert(player?.transform && player.transform.position.z > worldFixture().spawn.z);
  assert.deepEqual(result.pausedTicks, []);
  assert.equal(result.captured.world.resources.tick, result.initialTick + 2);
  assert.deepEqual(
    result.restored,
    result.captured,
    'Capture must survive the real worker boundary',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Built worker bootstrap, transferred rows, two fixture ticks, pause, capture/restore and disposal passed.',
  );
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
