import type { Worker } from 'playwright';
import type { RuntimeReply } from '../../src/contracts/simulation.ts';
import type { EngineStore } from '@babylonjs/core';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';

interface RendererStats {
  meshes: number;
  visibleMeshes: number;
  activeMeshes: number;
  drawCalls: number;
  canvasWidth: number;
  canvasHeight: number;
  player?: number[];
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '../..');
const renderDelayMs = Number(
  process.argv.find((arg) => arg.startsWith('--render-delay-ms='))?.split('=')[1] ?? 0,
);
assert(
  Number.isSafeInteger(renderDelayMs) && renderDelayMs >= 0 && renderDelayMs <= 5000,
  'Invalid diagnostic render delay',
);
const output = path.join(
  root,
  'tmp/production-worker-browser',
  renderDelayMs ? 'stalled-frames' : '',
);
await fs.mkdir(output, { recursive: true });
const directory = path.join(root, 'dist/scrapworks/browser');
const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const engineStoreChunk = Object.entries(metadata.outputs).find(([, output]) =>
  Object.keys(output.inputs ?? {}).some((input) =>
    input.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    ).replace(/^\/worker-test\//, '/');
    let target = path.resolve(directory, '.' + name);
    if (!target.startsWith(directory + path.sep) && target !== directory)
      throw new Error('Invalid path');
    if (name === '/' || !path.extname(target)) target = path.join(directory, 'index.html');
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.glb': 'model/gltf-binary',
    };
    response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream');
    response.setHeader(
      'Content-Security-Policy',
      "worker-src 'self'; object-src 'none'; base-uri 'self'",
    );
    let data = await fs.readFile(target);
    if (target.endsWith('index.html'))
      data = Buffer.from(data.toString().replace('<base href="/">', '<base href="/worker-test/">'));
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
if (renderDelayMs) {
  // Diagnostic mode delays only browser render callbacks. Input events, the worker
  // and authoritative simulation time are untouched. Preserve callback cancellation.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    window.requestAnimationFrame = (callback) => {
      const id = request((timestamp) => {
        const delay =
          (globalThis as unknown as { acceptanceFrameDelay?: number }).acceptanceFrameDelay ?? 0;
        if (!delay) return callback(timestamp);
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            callback(performance.now());
          }, delay),
        );
      });
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      cancel(id);
      clearTimeout(timers.get(id));
      timers.delete(id);
    };
  });
}
const errors: string[] = [];
const requests: { url: string; failure: { errorText: string } | null }[] = [];
let currentWorker: Worker | undefined;
let stage = 'menu loading';
page.on('pageerror', (error) => errors.push(String(error)));
page.on('requestfailed', (request) =>
  requests.push({ url: request.url(), failure: request.failure() }),
);

async function attachProbe(worker: Worker) {
  await worker.evaluate(() => {
    globalThis.productionProbe = { tick: 0, first: null, position: null };
    const scope = globalThis as unknown as {
      postMessage(message: RuntimeReply, transfer?: Transferable[]): void;
    };
    const send = scope.postMessage.bind(globalThis);
    scope.postMessage = (message, ...rest) => {
      if (message.packet) {
        const packet = message.packet;
        const transform = packet.endpoints.at(-1)?.transform;
        const position = transform?.position;
        globalThis.productionProbe = {
          tick: packet.tick,
          first: globalThis.productionProbe.first ?? position,
          position,
          moving: transform?.moving,
          mappingUpdates: packet.mappings.length,
        };
      }
      return send(message, ...rest);
    };
  });
}

const until = async (predicate: () => unknown | Promise<unknown>, message: string) => {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
};

try {
  await page.goto(
    `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/worker-test/`,
  );
  await page.getByRole('button', { name: 'Play Game!', exact: true }).waitFor();
  await until(
    () => page.getByRole('button', { name: 'Play Game!', exact: true }).isEnabled(),
    'Menu not ready',
  );
  const created = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  const worker = await created;
  currentWorker = worker;
  assert(worker.url().includes('/worker-test/worker-'));
  await attachProbe(worker);
  await until(
    async () => (await worker.evaluate(() => globalThis.productionProbe)).tick >= 2,
    'Production worker did not step',
  );
  const initial = await worker.evaluate(() => globalThis.productionProbe);
  assert.equal(await page.getByText('Debug drawings', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Show debug drawings', { exact: true }).count(), 0);

  const inspectRenderer = () =>
    page.evaluate(async (file) => {
      if (!file) return { unavailable: 'EngineStore chunk not identified' };
      const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
      const store = Object.values(module).find(
        (value): value is typeof EngineStore =>
          !!value &&
          typeof value === 'function' &&
          'Instances' in value &&
          Array.isArray(value.Instances) &&
          'LastCreatedEngine' in value,
      );
      const engine = store?.LastCreatedEngine,
        scene = engine?.scenes.at(-1);
      return scene
        ? await new Promise<RendererStats>((resolve) =>
            scene.onBeforeRenderObservable.addOnce(() => {
              const drawCallsBefore = (
                engine as typeof engine & { _drawCalls: { current: number } }
              )._drawCalls.current;
              scene.onAfterRenderObservable.addOnce(() =>
                resolve({
                  meshes: scene.meshes.length,
                  visibleMeshes: scene.meshes.filter((mesh) => mesh.isVisible && mesh.isEnabled())
                    .length,
                  activeMeshes: scene.getActiveMeshes().length,
                  drawCalls:
                    (engine as typeof engine & { _drawCalls: { current: number } })._drawCalls
                      .current - drawCallsBefore,
                  canvasWidth: engine!.getRenderWidth(),
                  canvasHeight: engine!.getRenderHeight(),
                  player: scene
                    .getTransformNodeByName('player-visual')
                    ?.position.asArray()
                    .map((value) => value / 100),
                }),
              );
            }),
          )
        : { unavailable: 'EngineStore is not exported by the build' };
    }, engineStoreChunk);

  const renderer = await inspectRenderer();
  stage = 'keyboard movement and render convergence';
  await page.locator('canvas').click();
  if (renderDelayMs)
    await page.evaluate((delay) => {
      const scope = globalThis as unknown as { acceptanceFrameDelay?: number };
      scope.acceptanceFrameDelay = delay;
      setTimeout(() => {
        scope.acceptanceFrameDelay = 0;
      }, delay * 2);
    }, renderDelayMs);
  await page.keyboard.down('KeyW');
  let movingTick = initial.tick;
  try {
    await until(async () => {
      const probe = await worker.evaluate(() => globalThis.productionProbe);
      movingTick = probe.tick;
      return (
        !!probe.position &&
        !!initial.position &&
        Math.hypot(probe.position.x - initial.position.x, probe.position.z - initial.position.z) >
          0.05
      );
    }, 'Held keyboard input did not produce authoritative movement');
  } finally {
    await page.keyboard.up('KeyW');
  }
  await until(async () => {
    const probe = await worker.evaluate(() => globalThis.productionProbe);
    return probe.tick > movingTick && probe.moving === false;
  }, 'Key release did not stop authoritative movement');
  const moved = await worker.evaluate(() => globalThis.productionProbe);
  let renderedMoved = await inspectRenderer();
  await until(async () => {
    renderedMoved = await inspectRenderer();
    return (
      !!moved.position &&
      'player' in renderedMoved &&
      !!renderedMoved.player &&
      Math.hypot(
        renderedMoved.player[0] - moved.position.x,
        renderedMoved.player[2] - moved.position.z,
      ) < 0.001
    );
  }, 'Rendered player did not converge to the completed worker position');
  assert.notDeepEqual(moved.position, initial.position);
  assert(moved.position && 'player' in renderedMoved && renderedMoved.player);
  assert(
    Math.hypot(
      renderedMoved.player[0] - moved.position.x,
      renderedMoved.player[2] - moved.position.z,
    ) < 0.001,
  );
  stage = 'menu pause';
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.waitForTimeout(150);
  const paused = await worker.evaluate(() => globalThis.productionProbe);
  await page.waitForTimeout(400);
  assert.equal((await worker.evaluate(() => globalThis.productionProbe)).tick, paused.tick);
  await page.screenshot({ path: path.join(output, 'paused.png') });
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  stage = 'healthy renderer Retry';
  await page.evaluate(() =>
    document
      .querySelector('canvas')!
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!
      .loseContext(),
  );
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await until(
    () => page.getByRole('button', { name: 'Play Game!', exact: true }).isEnabled(),
    'Graphics Retry not ready',
  );
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await until(
    async () => (await worker.evaluate(() => globalThis.productionProbe)).tick > paused.tick,
    'Retained worker did not resume',
  );
  assert.equal(page.workers().length, 1);
  assert.equal(page.workers()[0], worker);
  const healthyRetry = await worker.evaluate(() => globalThis.productionProbe);
  assert.deepEqual(healthyRetry.position, moved.position);
  stage = 'worker failure and authored Retry';
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.waitForTimeout(150);
  // Error injection only in this diagnostic process. No authority or assets are edited.
  await worker.evaluate(() =>
    setTimeout(() => {
      throw new Error('Production worker crash probe');
    }, 0),
  );
  await page.getByRole('alert').filter({ hasText: 'Retry restarts' }).waitFor();
  const error = await page.getByRole('alert').textContent();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await until(
    () => page.getByRole('button', { name: 'Play Game!', exact: true }).isEnabled(),
    'Retry did not recreate renderer',
  );
  const recreated = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  const fresh = await recreated;
  currentWorker = fresh;
  await attachProbe(fresh);
  await until(
    async () => (await fresh.evaluate(() => globalThis.productionProbe)).tick >= 1,
    'Fresh worker not ready',
  );
  const restarted = await fresh.evaluate(() => globalThis.productionProbe);
  assert.deepEqual(restarted.first, initial.first);
  const targetsBefore = page.workers().length;
  await page.goto('about:blank');
  await page.waitForTimeout(100);
  assert.equal(page.workers().length, 0);
  await fs.writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        status: 'ok',
        renderDelayMs,
        renderer,
        renderedMoved,
        healthyRetry,
        initial,
        moved,
        paused,
        restarted,
        error,
        targetsBefore,
        workerURL: worker.url(),
        csp: "worker-src 'self'",
        errors,
        requests,
      },
      null,
      2,
    ),
  );
  console.log(
    'Production worker/base path/CSP, keyboard movement, menu pause, crash/Retry and teardown passed.',
  );
} catch (error) {
  const probe = await currentWorker?.evaluate(() => globalThis.productionProbe).catch(() => null);
  const activity = await page
    .evaluate(() => ({
      focused: document.hasFocus(),
      hidden: document.hidden,
      activeElement: document.activeElement?.tagName,
    }))
    .catch(() => null);
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify(
      { error: String(error), stage, renderDelayMs, probe, activity, errors, requests },
      null,
      2,
    ),
  );
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
