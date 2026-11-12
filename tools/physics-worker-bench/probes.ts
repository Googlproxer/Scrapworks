import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium, firefox, type Page } from 'playwright';
import { installInputProbe } from './input-probe.ts';
import type { TraceEvent } from './browser-probe.ts';
import { detectResponse, type ProbeAttempt, type ProbeResult } from './detector.ts';
import { PROTOCOL, requireRunRelease, type Variant } from './protocol.ts';
import { distribution, seededRandom } from './statistics.ts';
import { reportRoot, toolRoot, digest, fileManifest, type Preparation } from './prepare.ts';

export interface ProbeOptions {
  authorized: boolean;
  variant: Variant;
  browser: 'chromium' | 'firefox';
  device: 'keyboard' | 'synthetic-gamepad';
  runs: number;
  cycles: number;
  headed: boolean;
  seed: number;
  holdMs: number;
}

export async function serveArtifact(
  directory: string,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      let file = path.resolve(directory, '.' + name);
      assert(file === directory || file.startsWith(directory + path.sep), 'Path escapes build');
      if (!path.extname(file)) file = path.join(directory, 'index.html');
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };
      response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader(
        'Content-Security-Policy',
        "worker-src 'self'; object-src 'none'; base-uri 'self'",
      );
      response.end(await fs.readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function drain(page: Page) {
  return page.evaluate(() => {
    const api = globalThis.__scrapworksPhysicsProbe;
    if (!api) throw new Error('Instrumented build did not install its probe');
    return {
      now: performance.now(),
      buffer: api.drain(),
      focused: document.hasFocus(),
      hidden: document.hidden,
    };
  });
}

/** Real browser input and render path; this function is never called by preparation. */
export async function runProbes(options: ProbeOptions): Promise<string> {
  requireRunRelease(options.authorized);
  assert(Number.isSafeInteger(options.runs) && options.runs >= 1 && options.runs <= 5);
  assert(Number.isSafeInteger(options.cycles) && options.cycles >= 1 && options.cycles <= 200);
  assert(
    options.holdMs >= 250 && options.holdMs <= 1000,
    'Sustained probe window must remain bounded on the test course',
  );
  const preparation = JSON.parse(
    await fs.readFile(path.join(reportRoot, 'preparation.json'), 'utf8'),
  ) as Preparation;
  assert.equal(
    digest(JSON.stringify(PROTOCOL)),
    preparation.protocolSha256,
    'Protocol changed after preparation',
  );
  const runToolManifest = await fileManifest(toolRoot);
  const frozenTools = JSON.parse(await fs.readFile(path.join(reportRoot, `prepared-${preparation.id}-files.json`), 'utf8')) as { tools: { path: string; sha256: string }[] };
  for (const name of ['browser-probe.ts', 'instrument.ts', 'variants.ts', 'remote-physics.ts', 'physics-protocol.ts', 'physics-host.ts', 'physics.worker.ts'])
    assert.equal(runToolManifest.find(file => file.path === name)?.sha256, frozenTools.tools.find(file => file.path === name)?.sha256, `Artifact-producing source changed: ${name}; rebuild before running`);
  const variant = preparation.variants[options.variant];
  assert(variant, 'Variant not prepared');
  const artifact = path.join(variant.artifact, 'browser');
  assert.equal(
    digest(JSON.stringify(await fileManifest(artifact))),
    variant.manifestSha256,
    'Prepared build changed',
  );
  const directory = path.join(
    path.join(path.dirname(reportRoot), new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())),
    'runs',
    new Date().toISOString().replaceAll(':', '-'),
    `${options.variant}-${options.browser}-${options.device}`,
  );
  await fs.mkdir(directory, { recursive: true });
  const server = await serveArtifact(artifact);
  const results: ProbeResult[] = [];
  const failures: string[] = [];
  const metadata: unknown[] = [];
  try {
    for (let run = 0; run < options.runs; ++run) {
      const browser = await (options.browser === 'chromium' ? chromium : firefox).launch({
        headless: !options.headed,
      });
      const context = await browser.newContext({
        viewport: options.headed ? null : { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(installInputProbe, {
        syntheticGamepad: options.device === 'synthetic-gamepad',
      });
      const raw = path.join(directory, `run-${run + 1}-trace.jsonl`);
      const pending: ProbeAttempt[] = [];
      let tail: TraceEvent[] = [],
        id = run * 100000;
      const random = seededRandom(options.seed + run);
      const collect = async () => {
        const sample = await drain(page);
        await fs.appendFile(
          raw,
          sample.buffer.events.map((event) => JSON.stringify(event)).join('\n') + '\n',
        );
        tail.push(...sample.buffer.events);
        assert.equal(sample.buffer.dropped, 0, 'Probe ring overflow invalidates this run');
        assert(!sample.hidden && sample.focused, 'Foreground/focus lost during measurement');
        for (let i = pending.length - 1; i >= 0; --i) {
          const result = detectResponse(pending[i], tail, { windowEndedAt: sample.now });
          if (result.status === 'pending') continue;
          results.push(result);
          pending.splice(i, 1);
        }
        tail = tail.filter((event) => event.now > sample.now - 5000);
      };
      try {
        await page.goto(server.url, { waitUntil: 'networkidle' });
        // Resolve controls from the loaded document, then wait for actual player presentation.
        const buttons = await page.getByRole('button').allTextContents();
        assert(
          buttons.some((text) => /new game/i.test(text)),
          `New Game control absent: ${buttons.join(', ')}`,
        );
        await page.getByRole('button', { name: /new game/i }).click();
        await page.locator('canvas').first().waitFor({ state: 'visible' });
        await page.waitForFunction(
          () =>
            globalThis.__scrapworksPhysicsProbe
              ?.drain()
              .events.some((event) => event.stage === 'present'),
          undefined,
          { timeout: 30000 },
        );
        await page.locator('canvas').first().click();
        await page.waitForTimeout(PROTOCOL.sampling.warmupSeconds * 1000);
        metadata.push(
          await page.evaluate(() => ({
            userAgent: navigator.userAgent,
            viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
            display: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
            timeOrigin: performance.timeOrigin,
            focused: document.hasFocus(),
            hidden: document.hidden,
            endpoint: 'submitted frame; no physical display timing claimed',
          })),
        );
        await drain(page);
        let baseDirection: { x: number; z: number } | undefined;
        for (let cycle = 0; cycle < options.cycles; ++cycle) {
          const sign = cycle % 2 ? -1 : 1;
          const forward = sign > 0 ? 'w' : 's',
            backward = sign > 0 ? 's' : 'w';
          for (const operation of ['start', 'reverse', 'release'] as const) {
            await page.waitForTimeout(random() * 50);
            if (operation === 'reverse' && options.device === 'keyboard')
              await page.keyboard.up(forward);
            const probeId = ++id;
            await page.evaluate(
              ({ probeId, operation, device }) =>
                globalThis.__scrapworksExperimentInput!.arm(probeId, operation, device),
              { probeId, operation, device: options.device },
            );
            const directionSign = operation === 'reverse' ? -sign : sign;
            const attempt: ProbeAttempt = {
              id: probeId,
              operation,
              device: options.device,
              direction: {
                x: (baseDirection?.x ?? 0) * directionSign,
                z: (baseDirection?.z ?? 0) * directionSign,
              },
            };
            pending.push(attempt);
            if (options.device === 'keyboard') {
              if (operation === 'start') await page.keyboard.down(forward);
              else if (operation === 'reverse') await page.keyboard.down(backward);
              else await page.keyboard.up(backward);
            } else {
              await page.evaluate(
                ({ sign, operation }) =>
                  globalThis.__scrapworksExperimentInput!.setGamepad(
                    0,
                    operation === 'release' ? 0 : operation === 'start' ? -sign : sign,
                  ),
                { sign, operation },
              );
            }
            await page.waitForTimeout(options.holdMs);
            const sample = await drain(page);
            tail.push(...sample.buffer.events);
            await fs.appendFile(
              raw,
              sample.buffer.events.map((event) => JSON.stringify(event)).join('\n') + '\n',
            );
            assert.equal(sample.buffer.dropped, 0, 'Probe ring overflow invalidates this run');
            if (!baseDirection) {
              const action = tail.find(
                (event) =>
                  event.stage === 'action' &&
                  event.data['probeId'] === probeId &&
                  Math.hypot(Number(event.data['x']), Number(event.data['z'])) > 0.01,
              );
              assert(action, 'Input did not traverse the production action/controller path');
              baseDirection = { x: Number(action.data['x']), z: Number(action.data['z']) };
            }
            attempt.direction = {
              x: baseDirection.x * directionSign,
              z: baseDirection.z * directionSign,
            };
            await collect();
            assert(!errors.length, errors.join('\n'));
          }
        }
        await page.waitForTimeout(PROTOCOL.response.timeoutMs + 100);
        await collect();
        for (const attempt of pending)
          results.push(
            detectResponse(attempt, tail, {
              windowEndedAt: await page.evaluate(() => performance.now()),
            }),
          );
      } catch (error) {
        failures.push(`run ${run + 1}: ${error instanceof Error ? error.message : String(error)}`);
        for (const attempt of pending)
          results.push({
            ...attempt,
            status: 'pending',
            observedAt: null,
            submittedAt: null,
            responseAt: null,
            latencyMs: null,
            stoppingDistance: null,
            inputSequence: null,
            tick: null,
            generation: null,
            reason: 'Run interrupted; retain right-censored attempt',
          });
      } finally {
        await context.close();
        await browser.close();
      }
    }
  } finally {
    await server.close();
    const summary = Object.fromEntries(
      ['start', 'release', 'reverse'].map((operation) => {
        const samples = results.filter((result) => result.operation === operation);
        return [
          operation,
          {
            attempted: samples.length,
            outcomes: samples.reduce<Record<string, number>>(
              (counts, sample) => ({
                ...counts,
                [sample.status]: (counts[sample.status] ?? 0) + 1,
              }),
              {},
            ),
            softwareLatencyMs: distribution(
              samples.flatMap((sample) => (sample.latencyMs === null ? [] : [sample.latencyMs])),
            ),
          },
        ];
      }),
    );
    await fs.writeFile(
      path.join(directory, 'result.json'),
      JSON.stringify(
        {
          protocol: PROTOCOL,
          runToolManifestSha256: digest(JSON.stringify(runToolManifest)),
          preparation: preparation.id,
          options,
          metadata,
          results,
          failures,
          summary,
          qualification:
            'unqualified until causal detector validation, phase coverage, sample accounting and matched comparisons are reviewed',
        },
        null,
        2,
      ) + '\n',
    );
  }
  return directory;
}
