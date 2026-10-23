import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { filesUnder, hash, projectRoot } from './inventory.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const output = argument('--output');
if (!output)
  throw new Error(
    'Usage: node tools/scenes/profile-browser.mjs --output <report.json> [--screenshots <directory>]',
  );
const directory = path.resolve(projectRoot, 'dist/scrapworks/browser');
const screenshotDirectory = argument('--screenshots', 'tmp/asset-audit/screenshots');
await fs.mkdir(screenshotDirectory, { recursive: true });

const assertProductionUi = async (page) => {
  const result = {
    diagnosticPanels: await page.locator('.top-left pre').count(),
    saveTestButtons: await page
      .getByRole('button', { name: /^(Open Test Save Dialog|Save Game|Load Game|Save|Load)$/i })
      .count(),
    saveTestDialogs: await page.locator('app-save-load').count(),
    fixtureInstructions: await page.getByText(/Development fixture:/).count(),
  };
  if (Object.values(result).some(Boolean))
    throw new Error(`Development UI reached production: ${JSON.stringify(result)}`);
  return result;
};

// RAF cadence includes browser scheduling and presentation work. It is neither
// a GPU timer nor a claim about a future factory with many simulated entities.
const sampleFrames = (page, durationMs) =>
  page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const intervalsMs = [];
        let start;
        let previous;
        const sample = (timestamp) => {
          start ??= timestamp;
          if (previous !== undefined) intervalsMs.push(timestamp - previous);
          previous = timestamp;
          if (timestamp - start < duration) {
            requestAnimationFrame(sample);
            return;
          }
          const sorted = [...intervalsMs].sort((a, b) => a - b);
          const percentile = (fraction) =>
            sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
          resolve({
            elapsedMs: timestamp - start,
            frames: intervalsMs.length,
            meanMs: intervalsMs.reduce((sum, interval) => sum + interval, 0) / intervalsMs.length,
            minMs: sorted[0],
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            p99Ms: percentile(0.99),
            maxMs: sorted.at(-1),
            over33_34Ms: intervalsMs.filter((interval) => interval > 33.34).length,
            intervalsMs,
          });
        };
        requestAnimationFrame(sample);
      }),
    durationMs,
  );

const auditProductionAssets = async () => {
  const worldPath = 'scene/worlds/game.json';
  const worldBytes = await fs.readFile(path.join(directory, worldPath));
  const sourceWorldBytes = await fs.readFile(path.join(projectRoot, 'public', worldPath));
  if (!worldBytes.equals(sourceWorldBytes))
    throw new Error('Production world definition differs from the current scene export');
  const world = JSON.parse(worldBytes);
  const entries = await Promise.all(
    (await filesUnder(directory)).map(async (file) => {
      const bytes = await fs.readFile(file);
      return {
        path: path.relative(directory, file).split(path.sep).join('/'),
        bytes: bytes.length,
        sha256: hash(bytes),
        phaserMarker:
          /\.(js|json|babylon)$/.test(file) && /\bphaser\b/i.test(bytes.toString('utf8')),
      };
    }),
  );
  const stats = await fs
    .readFile(path.join(directory, '../stats.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  const result = {
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    javascriptFilesScanned: entries.filter((entry) => entry.path.endsWith('.js')).length,
    phaserMarkers: entries.filter((entry) => entry.phaserMarker).map((entry) => entry.path),
    buildStatsAvailable: stats !== null,
    buildInputsScanned: Object.keys(stats?.inputs ?? {}).length,
    worldDefinition: {
      path: worldPath,
      id: world.id,
      grid: world.grid,
      bytes: worldBytes.length,
      sha256: hash(worldBytes),
    },
    phaserBuildInputs: Object.keys(stats?.inputs ?? {}).filter((input) =>
      /(^|[\\/])phaser([\\/]|$)/i.test(input),
    ),
    retiredRuntimeAssets: entries
      .filter((entry) =>
        /(^|\/)(Protag-v1\.glb|star\.png|basic-map\.json|player\.png|terrain\.png)$|(^|\/)(tilesets|player|map)\//i.test(
          entry.path,
        ),
      )
      .map((entry) => entry.path),
    models: entries
      .filter((entry) => /\.glb$/i.test(entry.path))
      .map(({ phaserMarker: _unused, ...entry }) => entry),
    sceneAssets: entries
      .filter((entry) => entry.path.startsWith('scene/'))
      .map(({ phaserMarker: _unused, ...entry }) => entry),
  };
  if (
    result.phaserMarkers.length ||
    result.phaserBuildInputs.length ||
    result.retiredRuntimeAssets.length
  )
    throw new Error(`Retired runtime content found: ${JSON.stringify(result)}`);
  if (result.models.length !== 1 || result.models[0].path !== 'assets/models/protagonist-v2.glb')
    throw new Error(
      `Expected exactly one deployed protagonist GLB: ${JSON.stringify(result.models)}`,
    );
  return result;
};
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.babylon': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
};
const cache = new Map();
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let target = path.resolve(directory, '.' + pathname);
    if (target !== directory && !target.startsWith(directory + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!(await fs.stat(target).catch(() => null))?.isFile()) {
      if (path.extname(pathname)) {
        response.writeHead(404).end();
        return;
      }
      target = path.join(directory, 'index.html');
    }
    const gzip =
      /\bgzip\b/.test(request.headers['accept-encoding'] ?? '') &&
      /\.(html|js|css|json|babylon|svg)$/.test(target);
    const key = target + ':' + gzip;
    if (!cache.has(key)) {
      const bytes = await fs.readFile(target);
      cache.set(key, gzip ? gzipSync(bytes) : bytes);
    }
    const bytes = cache.get(key);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
    });
    response.end(bytes);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const productionAssets = await auditProductionAssets();
  const routes = [];
  for (const { route, name } of [
    { route: '/', name: 'babylon-canonical' },
    { route: '/3d', name: 'babylon-alias' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [],
      failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400)
        failures.push({ url: response.url().replace(origin, ''), status: response.status() });
    });
    page.on('requestfailed', (request) =>
      failures.push({
        url: request.url().replace(origin, ''),
        error: request.failure()?.errorText,
      }),
    );
    await page.goto(origin + route);
    await page.waitForLoadState('networkidle');
    const play = page.getByRole('button', { name: /^Play Game/ });
    await play.waitFor({ state: 'visible' });
    await play.click({ trial: true });
    await page.getByRole('status').waitFor({ state: 'hidden' });
    const buttons = await page.getByRole('button').allTextContents();
    if (buttons.filter((button) => /^Play Game/.test(button.trim())).length !== 1)
      throw new Error('Unexpected menu controls');
    const finalPath = new URL(page.url()).pathname;
    if (finalPath !== '/')
      throw new Error(`Expected the canonical Babylon route after ${route}; received ${finalPath}`);
    const productionUi = { menu: await assertProductionUi(page) };
    const screenshots = {
      menu: `${name}-menu.png`,
      game: `${name}-game.png`,
      movement: `${name}-movement.png`,
    };
    await page.screenshot({ path: path.join(screenshotDirectory, screenshots.menu) });
    const readEntries = () =>
      page.evaluate(() =>
        [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
          .filter((entry) => entry.name.startsWith(location.origin))
          .map((entry) => ({
            path: new URL(entry.name).pathname,
            encodedBodyBytes: entry.encodedBodySize,
            decodedBodyBytes: entry.decodedBodySize,
            transferBytes: entry.transferSize,
          })),
      );
    const menu = await readEntries();
    await play.click();
    await play.waitFor({ state: 'hidden' });
    await page.getByRole('status').waitFor({ state: 'hidden' });
    await page.waitForLoadState('networkidle');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    if (await page.getByRole('alert').count())
      errors.push(await page.getByRole('alert').allTextContents());
    if ((await page.locator('canvas').count()) !== 1) errors.push('Expected one game canvas');
    productionUi.game = await assertProductionUi(page);
    const hardware = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
        canvas: { width: canvas.width, height: canvas.height },
        webglRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        webglVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
      };
    });
    const warmup = await sampleFrames(page, 1000);
    const stationary = await sampleFrames(page, 2000);
    await page.screenshot({ path: path.join(screenshotDirectory, screenshots.game) });
    await page.locator('canvas').focus();
    let movement;
    try {
      await page.keyboard.down('w');
      movement = await sampleFrames(page, 2000);
      await page.screenshot({ path: path.join(screenshotDirectory, screenshots.movement) });
    } finally {
      await page.keyboard.up('w');
    }
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('heading', { name: 'Paused', exact: true }).waitFor();
    productionUi.pauseMenu = await assertProductionUi(page);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.getByRole('heading', { name: 'Controls', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save controls', exact: true }).waitFor();
    productionUi.controls = await assertProductionUi(page);
    await page.getByRole('button', { name: 'Close controls', exact: true }).click();
    const complete = await readEntries();
    for (const required of [
      '/scene/game.babylon',
      '/scene/worlds/game.json',
      '/assets/models/protagonist-v2.glb',
    ]) {
      if (!complete.some((entry) => entry.path === required && entry.decodedBodyBytes > 0))
        errors.push(`Play Game did not load required runtime asset: ${required}`);
    }
    routes.push({
      route,
      finalPath,
      renderer: 'Babylon.js',
      menuButtons: buttons,
      readyFrameObserved: true,
      menu,
      gameAdditionalRequests: complete.slice(menu.length),
      productionUi,
      screenshots,
      hardware,
      frameCadence: {
        warmup,
        stationary,
        movement,
        movementInput:
          'W held for 2000 ms after focusing the game canvas; no developer inspection hooks.',
      },
      errors,
      failures,
    });
    await context.close();
  }
  const report = {
    recordedAt: new Date().toISOString(),
    browserVersion: browser.version(),
    method:
      'Production output on localhost; gzip for text, fresh headless Chromium context per route, no-store, desktop 1440x900. Body bytes from Resource Timing. RAF intervals measured after a 1000 ms warmup, then 2000 ms stationary and 2000 ms with forward input. This is a small migration-scene sample on the recorded renderer, not WAN latency, GPU timing, target-hardware qualification, or a factory-scale benchmark.',
    productionAssets,
    routes,
  };
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  for (const route of routes)
    console.log(
      JSON.stringify({
        route: route.route,
        menuBodyBytes: route.menu.reduce((sum, entry) => sum + entry.encodedBodyBytes, 0),
        gameAdditionalBodyBytes: route.gameAdditionalRequests.reduce(
          (sum, entry) => sum + entry.encodedBodyBytes,
          0,
        ),
        stationaryP95Ms: route.frameCadence.stationary.p95Ms,
        movementP95Ms: route.frameCadence.movement.p95Ms,
        errors: route.errors,
        failures: route.failures,
      }),
    );
  if (routes.some((route) => route.errors.length || route.failures.length)) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
