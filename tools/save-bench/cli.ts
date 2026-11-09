import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { chromium } from 'playwright';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import type { BrowserOptions, FixtureResult } from './model.ts';
import type { CaseSpec } from './browser.ts';
import { parseOptions } from './options.ts';
import { report } from './report.ts';

if (process.env['CI'] || process.env['GITHUB_ACTIONS'])
  throw new Error('Save performance benchmarks are local/manual only.');

if (process.argv.includes('--help')) {
  console.log(`Save-format benchmark (isolated persistent Chromium profile; production saves unchanged)
node tools/save-bench/cli.ts [--smoke] [--samples N] [--warmups N]
  [--populations 10000,100000,250000] [--physics-bodies 1000] [--seed 20261108]
  [--output tmp/save-bench/latest]
Default: opening + 10k/100k/250k piles + 1000 physics bodies, 11 samples, 2 warmups.
Smoke: opening + 100 entities + 32 physics bodies, 3 samples, 1 warmup.
Use --physics-bodies 0 to omit the physics case. Output must be within this checkout's tmp/.
Requires exported public/scene/worlds/game.json and the installed Playwright Chromium.
Writes result.json, report.md and an isolated browser profile. No live game database is opened.`);
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, '../..');
const options = parseOptions(process.argv.slice(2));
const output = path.resolve(root, options.output);
const relative = path.relative(path.join(root, 'tmp'), output);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
  throw new Error("Benchmark output must be a subdirectory of this checkout's tmp/.");
const web = path.join(output, 'web');
await fs.mkdir(output, { recursive: true });
const definitionPath = 'public/scene/worlds/game.json';
const definition = JSON.parse(
  await fs.readFile(path.join(root, definitionPath), 'utf8'),
) as WorldDefinition;
const source: Record<string, string> = {};
for (const folder of [
  'src/contracts',
  'src/simulation',
  'src/core',
  'src/session',
  'src/persistence',
  'src/workers',
  'src/content',
  'tools/save-bench',
])
  for (const name of (await fs.readdir(path.join(root, folder), { recursive: true })).sort()) {
    if (!name.endsWith('.ts') && !name.endsWith('.html')) continue;
    const file = `${folder}/${name.replaceAll('\\', '/')}`;
    source[file] = crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(root, file)))
      .digest('hex');
  }
for (const file of ['package.json', 'yarn.lock', 'tsconfig.json', definitionPath])
  source[file] = crypto
    .createHash('sha256')
    .update(await fs.readFile(path.join(root, file)))
    .digest('hex');
const results: FixtureResult[] = [];
const profile = path.join(output, `profile-${crypto.randomUUID()}`);
const manifest = {
  schema: 1,
  status: 'running',
  createdAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  worktree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
  source,
  options,
  environment: {
    node: process.versions,
    os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    browser: '',
    userAgent: '',
    profile: path.relative(root, profile).replaceAll('\\', '/'),
    storage:
      'Persistent Chromium profile on local filesystem; default IndexedDB durability; warm cache reads',
  },
  results,
};
const checkpoint = async () => {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'report.md'), report(results));
};
await checkpoint();
try {
  await build({
    configFile: false,
    root,
    base: '/',
    logLevel: 'warn',
    resolve: { tsconfigPaths: true },
    worker: { format: 'es' },
    build: {
      target: 'esnext',
      outDir: web,
      emptyOutDir: true,
      rollupOptions: { input: path.join(import.meta.dirname, 'browser.html') },
    },
  });
} catch (error) {
  manifest.status = 'failed';
  await checkpoint();
  throw error;
}
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = path.resolve(web, '.' + name);
    if (!file.startsWith(web + path.sep)) throw new Error('Invalid path.');
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const context = await chromium.launchPersistentContext(profile, { headless: true });
  try {
    manifest.environment.browser = context.browser()?.version() ?? 'unknown';
    const specs: CaseSpec[] = [
      { name: 'opening', bodies: 0 },
      ...options.populations.map((population) => ({
        name: `piles-${population}`,
        population,
        bodies: 0,
      })),
      ...(options.physicsBodies
        ? [{ name: `physics-${options.physicsBodies}`, bodies: options.physicsBodies }]
        : []),
    ];
    for (const spec of specs) {
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.text().startsWith('[save-bench]')) console.log(message.text());
      });
      try {
        let signal!: () => void;
        let fail!: (error: Error) => void;
        const ready = new Promise<void>((resolve, reject) => {
          signal = resolve;
          fail = reject;
        });
        page.on('pageerror', fail);
        await page.exposeFunction('saveBenchReady', signal);
        const timeout = setTimeout(
          () => fail(new Error('Benchmark module startup timed out.')),
          60000,
        );
        try {
          const port = (server.address() as import('node:net').AddressInfo).port;
          await page.goto(`http://127.0.0.1:${port}/tools/save-bench/browser.html`);
          await ready;
        } finally {
          clearTimeout(timeout);
        }
        manifest.environment.userAgent = await page.evaluate(() => navigator.userAgent);
        const result = await page.evaluate(
          async (input) => {
            const scope = globalThis as unknown as {
              runSaveBenchCase(options: BrowserOptions, spec: CaseSpec): Promise<FixtureResult>;
            };
            return scope.runSaveBenchCase(input.options, input.spec);
          },
          { options: { ...options, definition }, spec },
        );
        results.push(result);
        await checkpoint();
      } finally {
        await page.close();
      }
    }
    manifest.status = 'passed';
    await checkpoint();
    console.log(
      `Passed ${results.length} fixtures / ${results.reduce((sum, item) => sum + item.formats.length, 0)} format comparisons.`,
    );
    console.log(`Report: ${path.join(output, 'report.md')}`);
  } finally {
    await context.close();
  }
} catch (error) {
  manifest.status = 'failed';
  await checkpoint();
  throw error;
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
