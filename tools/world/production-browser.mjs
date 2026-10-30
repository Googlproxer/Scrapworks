import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'tmp/production-worker-browser');
await fs.mkdir(output, { recursive: true });
const directory = path.join(root, 'dist/scrapworks/browser');
const metadata = JSON.parse(
  await fs.readFile(path.join(root, 'dist/scrapworks/browser-stats.json'), 'utf8'),
);
const engineStoreChunk = Object.entries(metadata.outputs).find(([, output]) =>
  Object.keys(output.inputs ?? {}).some((input) =>
    input.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(
      /^\/worker-test\//,
      '/',
    );
    let target = path.resolve(directory, '.' + name);
    if (!target.startsWith(directory + path.sep) && target !== directory)
      throw new Error('Invalid path');
    if (name === '/' || !path.extname(target)) target = path.join(directory, 'index.html');
    const mime = {
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [],
  requests = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('requestfailed', (request) =>
  requests.push({ url: request.url(), failure: request.failure() }),
);
async function attachProbe(worker) {
  await worker.evaluate(() => {
    globalThis.productionProbe = { tick: 0, first: null, position: null };
    const send = globalThis.postMessage.bind(globalThis);
    globalThis.postMessage = (message, ...rest) => {
      if (message.packet) {
        const packet = message.packet;
        const position = packet.endpoints.at(-1)?.transform.position;
        globalThis.productionProbe = {
          tick: packet.tick,
          first: globalThis.productionProbe.first ?? position,
          position,
          mappingUpdates: packet.mappings.length,
        };
      }
      return send(message, ...rest);
    };
  });
}
const until = async (predicate, message) => {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/worker-test/`);
  await page.getByRole('button', { name: 'Play Game!', exact: true }).waitFor();
  await until(
    () => page.getByRole('button', { name: 'Play Game!', exact: true }).isEnabled(),
    'Menu not ready',
  );
  const created = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  const worker = await created;
  assert(worker.url().includes('/worker-test/worker-'));
  await attachProbe(worker);
  await until(
    async () => (await worker.evaluate(() => globalThis.productionProbe)).tick >= 2,
    'Production worker did not step',
  );
  const initial = await worker.evaluate(() => globalThis.productionProbe);
  const renderer = await page.evaluate(async (file) => {
    if (!file) return { unavailable: 'EngineStore chunk not identified' };
    const module = await import(new URL(file, document.baseURI).href);
    const store = Object.values(module).find(
      (value) => value && Array.isArray(value.Instances) && 'LastCreatedEngine' in value,
    );
    const engine = store?.LastCreatedEngine,
      scene = engine?.scenes.at(-1);
    return scene
      ? {
          meshes: scene.meshes.length,
          visibleMeshes: scene.meshes.filter((mesh) => mesh.isVisible && mesh.isEnabled()).length,
          activeMeshes: scene.getActiveMeshes().length,
          drawCalls: engine._drawCalls.current,
          canvasWidth: engine.getRenderWidth(),
          canvasHeight: engine.getRenderHeight(),
        }
      : { unavailable: 'EngineStore is not exported by the build' };
  }, engineStoreChunk);
  await page.locator('canvas').click();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  const moved = await worker.evaluate(() => globalThis.productionProbe);
  assert.notDeepEqual(moved.position, initial.position);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.waitForTimeout(150);
  const paused = await worker.evaluate(() => globalThis.productionProbe);
  await page.waitForTimeout(400);
  assert.equal((await worker.evaluate(() => globalThis.productionProbe)).tick, paused.tick);
  await page.screenshot({ path: path.join(output, 'paused.png') });
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
        renderer,
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
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), errors, requests }, null, 2),
  );
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
