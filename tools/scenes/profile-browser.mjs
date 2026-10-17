import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { projectRoot } from './inventory.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const output = argument('--output');
if (!output) throw new Error('Usage: node tools/scenes/profile-browser.mjs --output <report.json> [--screenshots <directory>]');
const directory = path.resolve(projectRoot, 'dist/scrapworks/browser');
const screenshotDirectory = argument('--screenshots', 'tmp/asset-audit/screenshots');
await fs.mkdir(screenshotDirectory, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.babylon': 'application/json',
  '.png': 'image/png',
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
    const gzip = /\bgzip\b/.test(request.headers['accept-encoding'] ?? '') && /\.(html|js|css|json|babylon|svg)$/.test(target);
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
  const routes = [];
  for (const route of ['/3d', '/']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [],
      failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push({ url: response.url().replace(origin, ''), status: response.status() });
    });
    page.on('requestfailed', (request) => failures.push({ url: request.url().replace(origin, ''), error: request.failure()?.errorText }));
    await page.goto(origin + route);
    await page.waitForLoadState('networkidle');
    const play = page.getByRole('button', { name: /^Play Game/ });
    await play.waitFor({ state: 'visible' });
    await play.click({ trial: true });
    await page.getByRole('status').waitFor({ state: 'hidden' });
    const buttons = await page.getByRole('button').allTextContents();
    if (buttons.filter((button) => /^Play Game/.test(button.trim())).length !== 1) throw new Error('Unexpected menu controls');
    await page.screenshot({ path: path.join(screenshotDirectory, route === '/3d' ? '3d-menu.png' : '2d-menu.png') });
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
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (await page.getByRole('alert').count()) errors.push(await page.getByRole('alert').allTextContents());
    if ((await page.locator('canvas').count()) !== 1) errors.push('Expected one game canvas');
    await page.screenshot({ path: path.join(screenshotDirectory, route === '/3d' ? '3d-game.png' : '2d-game.png') });
    const complete = await readEntries();
    routes.push({ route, menuButtons: buttons, readyFrameObserved: true, menu, gameAdditionalRequests: complete.slice(menu.length), errors, failures });
    await context.close();
  }
  const report = {
    recordedAt: new Date().toISOString(),
    method:
      'Production output on localhost; gzip for text, fresh Chromium context per route, no-store, desktop 1440x900. Body bytes from Resource Timing; not a WAN timing benchmark.',
    routes,
  };
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  for (const route of routes)
    console.log(
      JSON.stringify({
        route: route.route,
        menuBodyBytes: route.menu.reduce((sum, entry) => sum + entry.encodedBodyBytes, 0),
        gameAdditionalBodyBytes: route.gameAdditionalRequests.reduce((sum, entry) => sum + entry.encodedBodyBytes, 0),
        errors: route.errors,
        failures: route.failures,
      }),
    );
  if (routes.some((route) => route.errors.length || route.failures.length)) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
