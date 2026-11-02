import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'tmp/current-game-bench');
const full = process.argv.includes('--full');
await fs.mkdir(output, { recursive: true });
const files: Record<string, string> = {};
for (const folder of [
  'src/simulation',
  'src/session',
  'src/contracts',
  'src/content',
  'src/core',
  'src/workers',
  'tools/testing',
  'tools/game-bench',
]) {
  for (const file of (await fs.readdir(path.join(root, folder), { recursive: true }))
    .filter((file) => file.endsWith('.ts'))
    .sort()) {
    const name = `${folder}/${file.replaceAll('\\', '/')}`;
    files[name] = crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(root, name)))
      .digest('hex');
  }
}
for (const name of ['package.json', 'yarn.lock'])
  files[name] = crypto
    .createHash('sha256')
    .update(await fs.readFile(path.join(root, name)))
    .digest('hex');
await build({
  root,
  base: '/',
  logLevel: 'warn',
  build: {
    outDir: path.join(output, 'web'),
    emptyOutDir: true,
    rollupOptions: { input: path.join(import.meta.dirname, 'browser.html') },
  },
  resolve: { tsconfigPaths: true },
});
const server = http.createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const file = path.resolve(output, 'web', '.' + name);
  if (!file.startsWith(path.join(output, 'web') + path.sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/tools/game-bench/browser.html`,
  );
  await page.waitForFunction(() => 'runGameBench' in globalThis);
  const results = await page.evaluate(
    async (options) => {
      const scope = globalThis as unknown as {
        runGameBench(steps: number, population: number): Promise<unknown>;
      };
      return scope.runGameBench(options.steps, options.population);
    },
    { steps: full ? 2000 : 100, population: full ? 100000 : 1000 },
  );
  const manifest = {
    schema: 2,
    runtime: 'current-production-game',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source: files,
    createdAt: new Date().toISOString(),
    node: process.versions,
    browser: browser.version(),
    cpu: os.cpus()[0]?.model,
    os: `${os.platform()} ${os.release()}`,
    logicalCpus: os.cpus().length,
    memory: os.totalmem(),
    full,
    results,
  };
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
