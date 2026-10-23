import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { filesUnder, hash, projectRoot } from './inventory.mjs';
import { stopProcessTree } from './processes.mjs';

// Exercise the real watcher, CLI and Angular/Vite in an isolated project copy.
// No live Editor scene or user-owned source is changed by this probe.
const reportDirectory = path.join(projectRoot, 'tmp/workflow-browser');
await fs.mkdir(reportDirectory, { recursive: true });
const temporary = await fs.realpath(path.join(projectRoot, 'tmp'));
const fixture = await fs.mkdtemp(path.join(temporary, 'workflow-browser-'));
const logPath = path.join(reportDirectory, 'server.log');
await fs.writeFile(logPath, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(200);
  }
  throw new Error(`Timed out: ${description}. See ${logPath}`);
}
async function outputHashes() {
  const result = {};
  for (const file of [
    ...(await filesUnder(path.join(fixture, 'public/scene'))),
    path.join(fixture, 'src/scripts.ts'),
  ])
    result[path.relative(fixture, file)] = hash(await fs.readFile(file));
  return result;
}
let server,
  browser,
  logs = '';
try {
  for (const directory of ['assets', 'src', 'public/assets', 'tools/scenes', 'tools/world'])
    await fs.cp(path.join(projectRoot, directory), path.join(fixture, directory), {
      recursive: true,
    });
  for (const name of [
    'scrapworks.bjseditor',
    'package.json',
    'angular.json',
    'tsconfig.json',
    'tsconfig.app.json',
    '.prettierrc',
  ])
    await fs.copyFile(path.join(projectRoot, name), path.join(fixture, name));
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [path.join(fixture, 'tools/scenes/dev.mjs'), '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: fixture,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const recordLog = (chunk) => {
    const text = chunk.toString();
    logs += text;
    appendFileSync(logPath, text);
  };
  server.stdout.on('data', recordLog);
  server.stderr.on('data', recordLog);
  await until(async () => {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error(`Dev server exited: ${logs.slice(-2000)}`);
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', (error) => {
        socket.destroy();
        if (error.code === 'EACCES')
          reject(
            new Error(
              'Localhost access is blocked by the execution environment; run this browser probe with loopback access.',
            ),
          );
        else resolve(false);
      });
    });
  }, 'Angular listening socket');
  console.log('Workflow probe: initial export and Angular startup passed.');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultNavigationTimeout(120000);
  let navigations = 0;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  const ready = async () => {
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Play Game/ }).click({ trial: true });
    await page.getByRole('status').waitFor({ state: 'hidden' });
  };
  await page.goto(origin + '/3d');
  await ready();
  const configFile = path.join(fixture, 'assets/main-menu.scene/config.json');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  config.clearColor = [0.1, 0.3, 0.2, 1];
  let previousNavigations = navigations;
  await fs.writeFile(configFile, JSON.stringify(config, null, 4));
  await until(() => navigations > previousNavigations, 'reload after valid saved scene');
  await ready();
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(fixture, 'public/scene/main-menu.babylon'))).clearColor,
    config.clearColor,
  );
  const beforeFailure = await outputHashes();
  previousNavigations = navigations;
  await fs.writeFile(configFile, '{ invalid saved JSON');
  await until(
    () => logs.includes('Export failed; last working scenes retained:'),
    'visible export error',
  );
  await sleep(800);
  assert.equal(navigations, previousNavigations, 'Invalid save must not reload the browser');
  assert.deepEqual(
    await outputHashes(),
    beforeFailure,
    'Invalid save must preserve all published files',
  );
  console.log(
    'Workflow probe: valid save reloaded; invalid save retained all output without reload.',
  );
  config.clearColor = [0.3, 0.2, 0.1, 1];
  await fs.writeFile(configFile, JSON.stringify(config, null, 4));
  await until(() => navigations > previousNavigations, 'reload after corrected save');
  await ready();
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(fixture, 'public/scene/main-menu.babylon'))).clearColor,
    config.clearColor,
  );
  await page.getByRole('button', { name: /^Play Game/ }).click();
  await page.getByRole('button', { name: /^Play Game/ }).waitFor({ state: 'hidden' });
  await page.getByRole('status').waitFor({ state: 'hidden' });
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(reportDirectory, 'game-after-recovery.png') });
  const report = {
    recordedAt: new Date().toISOString(),
    method:
      'Copied project; real Editor CLI, native authoring watcher, Angular/Vite and headless Chromium on loopback',
    angularWatchMode: process.platform === 'linux' ? 'polling-500ms' : 'native',
    initialMenuReady: true,
    validSaveReloaded: true,
    invalidSaveReloaded: false,
    failedExportPreservedAllPublishedHashes: true,
    correctedSaveRecoveredAndReloaded: true,
    gameReadyAfterRecovery: true,
    browserErrors: errors,
  };
  await fs.writeFile(
    path.join(reportDirectory, 'verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    await stopProcessTree(server);
    await until(
      () => server.exitCode !== null || server.signalCode !== null,
      'dev server shutdown',
      10000,
    );
  }
  const resolved = await fs.realpath(fixture);
  if (
    path.dirname(resolved) !== temporary ||
    !path.basename(resolved).startsWith('workflow-browser-')
  )
    throw new Error('Unexpected browser-fixture cleanup path');
  await fs.rm(resolved, { recursive: true });
}
