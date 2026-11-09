import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium, firefox, type Page } from 'playwright';
import { createServer } from 'vite';
import type { EngineStore } from '@babylonjs/core';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import type { BuildMetadata } from '../shared.ts';
import { filesUnder, hash } from '../scenes/inventory.ts';
import { seedSave, readManualSave, readSavedHistory } from '../../tests/acceptance/manual-save.ts';
import { installBrowserEvents } from '../../tests/acceptance/browser-events.ts';
import { installWorkerProbe, readWorkerProbe } from './worker-probe.ts';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Local only: node tools/portfolio/run.ts [--browser all|chromium|firefox] [--workload all|renewable|mixed|stress | --save checkpoint.json] [--headed] [--quick] [--save-samples 12] [--worker-probe] [--no-autosave] [--output directory] [--artifact directory]',
  );
  process.exit(0);
}
assert(
  !process.env['CI'] && !process.env['GITHUB_ACTIONS'],
  'Portfolio performance/full gameplay diagnostics are local/manual only; never run in CI.',
);
const value = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  assert(args[at + 1] && !args[at + 1].startsWith('--'), `Missing ${name} value`);
  return args[at + 1];
};
const browserChoice = value('--browser', 'all'),
  workloadChoice = value('--workload', 'all');
const savePath = args.includes('--save') ? path.resolve(root, value('--save', '')) : null;
assert(!savePath || workloadChoice === 'all', 'Choose --save or --workload, not both');
assert(['all', 'chromium', 'firefox'].includes(browserChoice), 'Unknown browser');
assert(['all', 'renewable', 'mixed', 'stress'].includes(workloadChoice), 'Unknown workload');
const quick = args.includes('--quick'),
  headed = args.includes('--headed'),
  autosave = !quick && !args.includes('--no-autosave');
const options = {
  quick,
  headed,
  autosave,
  workerProbe: args.includes('--worker-probe'),
  durationMs: quick ? 3000 : 30000,
  repetitions: quick ? 1 : 3,
  saveSamples: Number(value('--save-samples', quick ? '3' : '12')),
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
};
assert(
  Number.isSafeInteger(options.saveSamples) &&
    options.saveSamples >= 1 &&
    options.saveSamples <= 100,
  'Invalid save sample count',
);
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const output = path.resolve(root, value('--output', `docs/reports/milestone-10/${date}/baseline`));
const directory = path.resolve(root, value('--artifact', 'dist/scrapworks/browser'));
await fs.mkdir(output, { recursive: true });
const metadata = JSON.parse(
  await fs.readFile(path.join(path.dirname(directory), 'browser-stats.json'), 'utf8'),
) as BuildMetadata;
const engineChunk = Object.entries(metadata.outputs).find(([, o]) =>
  Object.keys(o.inputs ?? {}).some((i) =>
    i.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
const runtimeChunk = Object.entries(metadata.outputs).find(
  ([name, o]) =>
    name.startsWith('worker-chunk-') &&
    Object.keys(o.inputs ?? {}).some((i) =>
      i.replaceAll('\\', '/').endsWith('/session/runtime.ts'),
    ),
)?.[0];
assert(engineChunk, 'Build with --stats-json first');
assert(runtimeChunk, 'Missing production runtime chunk for worker profiling');
const assets = await Promise.all(
  (await filesUnder(directory)).map(async (file) => {
    const bytes = await fs.readFile(file);
    return {
      path: path.relative(directory, file).replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: hash(bytes),
    };
  }),
);
const git = (...argv: string[]) =>
  execFileSync('git', argv, { cwd: root, encoding: 'utf8' }).trim();
const protocol = {
  schema: 2,
  fixtureVersion: 2,
  seed: 'production deterministic seeds',
  options,
  gates: {
    frameP95: 18.5,
    frameP99: 33.4,
    saveP95: 250,
    loadP95: 2000,
    storageInvestigationBytes: 10_000_000,
  },
  method:
    'Current-asset baseline. Controlled prepared factory fixtures are not earned gameplay. RAF is scheduling/presentation, not GPU time. Headless/software drivers do not qualify physical display cadence. Inline control phase timings are not production worker CPU.',
  saveMeasurement:
    'Browser click dispatch to observed atomic IndexedDB revision, excluding automation actionability waits; polling resolution 15 ms.',
  loadMeasurement:
    'Continue action to completed playable renderer frame, with full browser reload/navigation reported separately.',
};
const report = {
  recordedAt: new Date().toISOString(),
  stage: 'current-asset-baseline',
  revision: git('rev-parse', 'HEAD'),
  dirty: git('status', '--short'),
  node: process.version,
  os: {
    platform: os.platform(),
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    threads: os.cpus().length,
    memory: os.totalmem(),
  },
  protocol,
  assets,
  results: [] as Record<string, unknown>[],
  failures: [] as string[],
};
const staticServer = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let target = path.resolve(directory, '.' + pathname);
    assert(target === directory || target.startsWith(directory + path.sep));
    if (!path.extname(target)) target = path.join(directory, 'index.html');
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.glb': 'model/gltf-binary',
      '.webp': 'image/webp',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
      '.wasm': 'application/wasm',
    };
    res.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "worker-src 'self'; object-src 'none'; base-uri 'self'",
    );
    res.end(await fs.readFile(target));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => staticServer.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(staticServer.address() as import('node:net').AddressInfo).port}/`;
const modules = await createServer({
  configFile: false,
  root,
  resolve: { tsconfigPaths: true },
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await modules.listen();
const quantiles = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b),
    at = (p: number) => v[Math.max(0, Math.ceil(v.length * p) - 1)] ?? null;
  return { count: v.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: v.at(-1) ?? null };
};
async function frames(page: Page, duration: number) {
  return page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const values: number[] = [];
        let first = 0,
          previous = 0;
        const next = (t: number) => {
          first ||= t;
          if (previous) values.push(t - previous);
          previous = t;
          if (t - first < ms) requestAnimationFrame(next);
          else resolve(values);
        };
        requestAnimationFrame(next);
      }),
    duration,
  );
}
async function save(page: Page) {
  const before = (await readManualSave(page))?.sequence ?? 0;
  await page.evaluate((sequence) => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Save progress',
    );
    if (!button) throw new Error('Missing save control');
    const scope = window as unknown as { portfolioCommit: Promise<number> };
    scope.portfolioCommit = new Promise<number>((resolve, reject) => {
      button.addEventListener(
        'click',
        () => {
          const start = performance.now(),
            request = indexedDB.open('ScrapworksGameplaySaves');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const poll = () => {
              const tx = db.transaction('revisions', 'readonly'),
                r = tx.objectStore('revisions').getAll();
              tx.oncomplete = () => {
                if (
                  (r.result as { kind: string; sequence: number }[]).some(
                    (m) => m.kind === 'manual' && m.sequence > sequence,
                  )
                ) {
                  db.close();
                  resolve(performance.now() - start);
                } else if (performance.now() - start > 30000) {
                  db.close();
                  reject(new Error('Save commit timeout'));
                } else setTimeout(poll, 15);
              };
              tx.onerror = () => {
                db.close();
                reject(tx.error);
              };
            };
            poll();
          };
        },
        { once: true, capture: true },
      );
    });
  }, before);
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  return page.evaluate(
    () => (window as unknown as { portfolioCommit: Promise<number> }).portfolioCommit,
  );
}
try {
  const fixtures = (await modules.ssrLoadModule(
    '/tools/portfolio/fixtures.ts',
  )) as typeof import('./fixtures.ts');
  const definition = JSON.parse(
    await fs.readFile(path.join(directory, 'scene/worlds/game.json'), 'utf8'),
  ) as WorldDefinition;
  let suppliedSave: SaveSnapshot | undefined;
  if (savePath) {
    const codec = (await modules.ssrLoadModule(
      '/src/persistence/save-codec.ts',
    )) as typeof import('../../src/persistence/save-codec.ts');
    const maps = (await modules.ssrLoadModule(
      '/src/core/authored-map.ts',
    )) as typeof import('../../src/core/authored-map.ts');
    assert(
      (await fs.stat(savePath)).size <= codec.MAX_SAVE_BYTES,
      'Checkpoint exceeds save byte limit',
    );
    suppliedSave = codec.parseBackup(await fs.readFile(savePath, 'utf8'));
    maps.assertSameAuthoredMap(suppliedSave.world.definition, definition);
    assert(
      !suppliedSave.world.entities.find((e) => e.kind === 'player')?.opening?.handcraft,
      'Use a checkpoint with handcrafting finished or deliberately cancelled; this movement/rendering diagnostic does not close unfinished crafting for you.',
    );
  }
  for (const browserName of browserChoice === 'all'
    ? (['chromium', 'firefox'] as const)
    : [browserChoice as 'chromium' | 'firefox']) {
    const browser = await (browserName === 'chromium' ? chromium : firefox).launch({
      headless: !headed,
    });
    try {
      for (const workload of suppliedSave
        ? ['supplied-checkpoint']
        : fixtures.WORKLOADS.filter((w) => workloadChoice === 'all' || w === workloadChoice)) {
        const context = await browser.newContext({
          viewport: options.viewport,
          deviceScaleFactor: 1,
        });
        const page = await context.newPage(),
          errors: string[] = [],
          failedRequests: string[] = [],
          navigationAborts: string[] = [];
        await page.addInitScript(() => {
          const data = {
            longTasksSupported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
            longTasks: [] as { start: number; duration: number }[],
            inputToRafMs: [] as number[],
            peakObservedJsHeapBytes: null as number | null,
          };
          (window as unknown as { portfolioTelemetry: typeof data }).portfolioTelemetry = data;
          if (data.longTasksSupported)
            new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                data.longTasks.push({ start: e.startTime, duration: e.duration });
            }).observe({ type: 'longtask', buffered: true });
          // Local diagnostic probes only; no production listener or gameplay hook.
          window.addEventListener(
            'keydown',
            (event) => {
              if (event.repeat || !['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) return;
              const start = performance.now();
              requestAnimationFrame(() => data.inputToRafMs.push(performance.now() - start));
            },
            { capture: true, passive: true },
          );
          const memory = () => {
            const bytes = (performance as Performance & { memory?: { usedJSHeapSize: number } })
              .memory?.usedJSHeapSize;
            if (bytes !== undefined)
              data.peakObservedJsHeapBytes = Math.max(data.peakObservedJsHeapBytes ?? 0, bytes);
            requestAnimationFrame(memory);
          };
          requestAnimationFrame(memory);
        });
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('requestfailed', (r) => {
          const message = r.url() + ': ' + r.failure()?.errorText;
          if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(message)) navigationAborts.push(message);
          else failedRequests.push(message);
        });
        page.on('response', (r) => {
          if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
        });
        let fixture: SaveSnapshot | undefined;
        try {
          fixture = suppliedSave
            ? structuredClone(suppliedSave)
            : fixtures.portfolioFixture(definition, workload as import('./fixtures.ts').Workload);
          await fs.writeFile(
            path.join(output, `${workload}-fixture.json`),
            JSON.stringify(fixture),
          );
          await installBrowserEvents(page, engineChunk);
          await page.goto(url);
          await page.getByRole('button', { name: 'New Game', exact: true }).waitFor();
          await seedSave(page, fixture);
          await page.reload();
          const coldStart = performance.now();
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          await page.locator('[data-objective-title]').waitFor();
          await page.evaluate(() => window.testEvents.frame());
          const coldLoadMs = performance.now() - coldStart;
          const worker = page.workers()[0];
          assert(worker, 'Missing production worker');
          // Firefox 159/Juggler crashed during dynamic-import worker probing; keep
          // its production path unmodified and report the missing metric explicitly.
          const workerProbeSupported = browserName === 'chromium' && options.workerProbe;
          if (workerProbeSupported)
            await installWorkerProbe(worker, new URL(runtimeChunk, url).href);
          const renderer = await page.evaluate(async (chunk) => {
            const m = (await import(new URL(chunk, document.baseURI).href)) as Record<
              string,
              unknown
            >;
            const store = Object.values(m).find(
              (v): v is typeof EngineStore =>
                typeof v === 'function' && 'LastCreatedEngine' in v && 'Instances' in v,
            );
            const e = store?.LastCreatedEngine,
              s = e?.scenes[0],
              canvas = document.querySelector('canvas'),
              gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl'),
              d = gl?.getExtension('WEBGL_debug_renderer_info');
            return {
              meshes: s?.meshes.length,
              activeMeshes: s?.getActiveMeshes().length,
              vertices: s?.getTotalVertices(),
              renderer: d ? gl!.getParameter(d.UNMASKED_RENDERER_WEBGL) : null,
              vendor: d ? gl!.getParameter(d.UNMASKED_VENDOR_WEBGL) : null,
              canvas: { width: canvas?.width, height: canvas?.height },
              userAgent: navigator.userAgent,
              visibility: document.visibilityState,
            };
          }, engineChunk);
          await frames(page, 1000);
          const frameSamples: number[][] = [];
          for (let repetition = 0; repetition < options.repetitions; repetition++) {
            await page.locator('canvas').focus();
            const measurement = frames(page, options.durationMs);
            await page.keyboard.down('w');
            try {
              await page.waitForTimeout(400);
              await page.keyboard.up('w');
              await page.keyboard.down('s');
              await page.waitForTimeout(400);
              await page.keyboard.up('s');
              frameSamples.push(await measurement);
            } finally {
              await page.keyboard.up('w');
              await page.keyboard.up('s');
            }
          }
          let autosaveEvidence: unknown = {
            measured: false,
            reason: 'Explicit quick/no-autosave mode',
          };
          if (autosave) {
            const start = performance.now(),
              before = (await readSavedHistory(page)).filter((s) => s.kind === 'auto').length;
            const intervals = await frames(
              page,
              Math.max(10000, 130000 - options.durationMs * options.repetitions),
            );
            const after = (await readSavedHistory(page)).filter((s) => s.kind === 'auto').length;
            autosaveEvidence = {
              measured: true,
              elapsedMs: performance.now() - start,
              before,
              after,
              frame: quantiles(intervals),
            };
            assert(after > before, 'No active-time autosave committed');
          }
          const telemetry = await page.evaluate(
            () =>
              (
                window as unknown as {
                  portfolioTelemetry: {
                    longTasksSupported: boolean;
                    longTasks: { start: number; duration: number }[];
                    inputToRafMs: number[];
                    peakObservedJsHeapBytes: number | null;
                  };
                }
              ).portfolioTelemetry,
          );
          const workerTiming = workerProbeSupported ? await readWorkerProbe(worker) : null;
          await page.keyboard.press('Tab');
          await page.getByRole('heading', { name: 'Field kit', exact: true }).waitFor();
          const saves: number[] = [],
            loads: number[] = [],
            completeReloads: number[] = [],
            automationLoadActions: number[] = [];
          for (let i = 0; i < options.saveSamples; i++) {
            saves.push(await save(page));
            const reloadStart = performance.now();
            await page.reload();
            await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
            await page.evaluate(() => {
              const button = [...document.querySelectorAll('button')].find(
                (b) => b.textContent?.trim() === 'Continue',
              );
              if (!button) throw new Error('Missing Continue control');
              button.addEventListener(
                'click',
                () => {
                  (window as unknown as { portfolioLoadStart: number }).portfolioLoadStart =
                    performance.now();
                },
                { once: true, capture: true },
              );
            });
            const start = performance.now();
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            await page.locator('[data-objective-title]').waitFor();
            await page.evaluate(() => window.testEvents.frame());
            automationLoadActions.push(performance.now() - start);
            loads.push(
              await page.evaluate(
                () =>
                  performance.now() -
                  (window as unknown as { portfolioLoadStart: number }).portfolioLoadStart,
              ),
            );
            completeReloads.push(performance.now() - reloadStart);
            await page.locator('canvas').focus();
            await page.keyboard.press('Tab');
            await page.getByRole('heading', { name: 'Field kit', exact: true }).waitFor();
          }
          await page.locator('#guide-tab').click();
          await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
          const axe = await page.evaluate(async () => {
            const a = await (window as unknown as { axe: typeof import('axe-core') }).axe.run();
            return a.violations;
          });
          assert.deepEqual(axe, []);
          await page.screenshot({
            path: path.join(output, `${browserName}-${workload}-manual.png`),
          });
          await page.setViewportSize({ width: 390, height: 844 });
          assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'Responsive UI overflows',
          );
          const responsiveAxe = await page.evaluate(
            async () =>
              (await (window as unknown as { axe: typeof import('axe-core') }).axe.run())
                .violations,
          );
          assert.deepEqual(responsiveAxe, []);
          await page.locator('#guide-panel').focus();
          await page.keyboard.press('PageDown');
          await page.screenshot({
            path: path.join(output, `${browserName}-${workload}-manual-mobile.png`),
          });
          await page.setViewportSize(options.viewport);
          await page.getByRole('button', { name: 'Close', exact: true }).click();
          await page.screenshot({
            path: path.join(output, `${browserName}-${workload}-world.png`),
          });
          const phasePage = await context.newPage();
          await phasePage.goto(modules.resolvedUrls!.local[0] + 'tools/portfolio/profile.html');
          const phases = await phasePage.evaluate(
            async ({ input, samples }) => {
              const url = '/tools/portfolio/phases.ts';
              const m = (await import(url)) as typeof import('./phases.ts');
              return m.profilePhases(input, samples);
            },
            { input: fixture, samples: options.saveSamples },
          );
          await phasePage.close();
          assert.deepEqual(errors, []);
          assert.deepEqual(failedRequests, []);
          const frame = frameSamples.map(quantiles),
            saveStats = quantiles(saves),
            loadStats = quantiles(loads);
          report.results.push({
            browser: browserName,
            version: browser.version(),
            workload,
            checkpointProvenance: suppliedSave
              ? 'Supplied validated checkpoint; earned status requires separate route evidence. No grants or fixture edits applied.'
              : 'Controlled prepared diagnostic fixture, not earned gameplay.',
            counts: fixtures.workloadCounts(fixture.world),
            endCounts: fixtures.workloadCounts((await readManualSave(page))!.world),
            fixtureHash: hash(JSON.stringify(fixture)),
            renderer,
            telemetry,
            workerTiming,
            workerProbeStatus: workerProbeSupported
              ? 'Measured with local production-worker wrappers'
              : options.workerProbe
                ? 'Unavailable: Firefox 159/Juggler worker dynamic-import probe crashed; production path remains unmodified and inline controls are separate.'
                : 'Disabled for the standard frame-comparison protocol; use --worker-probe for a separately labelled Chromium worker diagnostic.',
            workerStats: Object.fromEntries(
              Object.entries(workerTiming ?? {}).map(([k, v]) => [k, quantiles(v)]),
            ),
            coldLoadMs,
            frameSamples,
            frame,
            manualCommitMs: saves,
            continueToPlayableMs: loads,
            completeReloadMs: completeReloads,
            automationLoadActionMs: automationLoadActions,
            saveStats,
            loadStats,
            autosaveEvidence,
            phases,
            phaseStats: Object.fromEntries(
              Object.entries(phases.timing).map(([key, v]) => [key, quantiles(v)]),
            ),
            axe,
            responsiveAxe,
            errors,
            failedRequests,
            navigationAborts,
            gateResults: {
              frame: frame.every(
                (s) =>
                  s.p95 !== null &&
                  s.p95 <= protocol.gates.frameP95 &&
                  s.p99 !== null &&
                  s.p99 <= protocol.gates.frameP99,
              ),
              save: saveStats.p95 !== null && saveStats.p95 <= protocol.gates.saveP95,
              load: loadStats.p95 !== null && loadStats.p95 <= protocol.gates.loadP95,
              storage: phases.retainedJsonBytes <= protocol.gates.storageInvestigationBytes,
            },
            limitations: [
              'No final-asset qualification',
              'No independent human pacing evidence',
              'Production worker step/publication/capture/handle timing wrappers are diagnostic only; transport queue/delivery and Angular/Babylon costs remain separately bounded by observed frames/input. Browser-inline controls are labelled separately.',
              'Long Tasks are browser-specific; peakObservedJsHeapBytes is a sampled JS heap maximum, not total process/GPU memory. Input-to-RAF is a scheduling observation, not command-to-visible latency.',
              'completeReloadMs includes fresh HTML/menu navigation; continueToPlayableMs measures the player load action. Cold/warm delivery depends on the recorded local server.',
            ],
          });
          console.log(
            JSON.stringify({ browser: browserName, workload, frame, saveStats, loadStats }),
          );
        } catch (error) {
          report.failures.push(`${browserName}/${workload}: ${String(error)}`);
          await page
            .screenshot({ path: path.join(output, `${browserName}-${workload}-failure.png`) })
            .catch(() => undefined);
        } finally {
          await context.close();
          await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await modules.close();
  await new Promise<void>((resolve) => staticServer.close(() => resolve()));
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
}
if (report.failures.length) {
  console.error(report.failures);
  process.exitCode = 1;
}
