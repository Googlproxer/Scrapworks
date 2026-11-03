import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import type axe from 'axe-core';
import type { BuildMetadata } from '../../tools/shared.ts';

interface PaintProbe {
  fcp: number;
  lcp: number;
  webgl: number;
}

function startupChunks(metadata: BuildMetadata) {
  const outputs = metadata.outputs;

  const entry = (source: string) => {
    const result = Object.keys(outputs).find((key) => outputs[key].entryPoint === source);
    assert(result, `Missing startup entry: ${source}`);
    return result;
  };

  const staticGraph = (key: string, visited = new Set<string>()): Set<string> => {
    if (visited.has(key)) return visited;
    visited.add(key);
    for (const dependency of outputs[key].imports ?? []) {
      if (
        dependency.external ||
        dependency.kind === 'dynamic-import' ||
        dependency.kind === 'url-token'
      )
        continue;
      const next =
        dependency.path in outputs
          ? dependency.path
          : path.posix.join(path.posix.dirname(key), dependency.path);
      if (next in outputs) staticGraph(next, visited);
    }
    return visited;
  };

  const main = entry('src/main.ts');
  const route = entry('src/app/features/game/game-page/game-page.component.ts');
  const renderer = entry('src/game/bootstrap.ts');
  for (const root of [main, route]) {
    for (const key of staticGraph(root)) {
      assert(
        !Object.keys(outputs[key].inputs ?? {}).some((source) =>
          /node_modules\/(?:@babylonjs|babylonjs-editor-tools)\//.test(
            source.replaceAll('\\', '/'),
          ),
        ),
        `Babylon entered the static UI graph: ${key}`,
      );
    }
  }
  return {
    main,
    route,
    renderer,
    routeBytes: outputs[route].bytes,
    rendererBytes: outputs[renderer].bytes,
  };
}

async function menuReady(page: Page) {
  await page.waitForFunction(
    () => !!document.querySelector<HTMLButtonElement>('[data-play]:not(:disabled)'),
  );
}

async function accessible(page: Page, source: string) {
  await page.addScriptTag({ content: source });
  const violations = await page.evaluate(async () => {
    const checker = (window as unknown as { axe: typeof axe }).axe;
    return (await checker.run()).violations.map(({ id, nodes }) => ({
      id,
      elements: nodes.map((node) => node.html),
    }));
  });
  assert.deepEqual(violations, []);
}

async function covered(page: Page) {
  await page.locator('app-game-page app-loading-screen').waitFor();
  assert(
    await page.evaluate(() => {
      const cover = document.querySelector<HTMLElement>('app-game-page app-loading-screen')!;
      const bounds = cover.getBoundingClientRect();
      const host = document.querySelector<HTMLElement>('.game-container')!;
      return (
        bounds.left === 0 &&
        bounds.top === 0 &&
        bounds.width === innerWidth &&
        bounds.height === innerHeight &&
        getComputedStyle(cover).backgroundColor === 'rgb(12, 19, 19)' &&
        host.inert &&
        !document.querySelector('.game-help')
      );
    }),
    'Loading cover must fully hide the canvas and suspend interaction',
  );
}

/** Runs against the existing production server, including its base-path deployment. */
export async function checkLoading(
  browser: Browser,
  url: string,
  metadata: BuildMetadata,
  output: string,
) {
  const chunks = startupChunks(metadata);
  const axeSource = await fs.readFile(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8');
  const noScripts = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 240 },
  });
  try {
    const page = await noScripts.newPage();
    await page.goto(url);
    assert.equal(await page.getByRole('status').textContent(), 'Starting Scrapworks…');
    assert(await page.getByRole('progressbar').isVisible());
    await page.screenshot({ path: path.join(output, 'loading-no-javascript.png') });
  } finally {
    await noScripts.close();
  }

  const samples: (PaintProbe & { cpuRate: number; cached: boolean; rendererRequest: number })[] =
    [];
  for (const cpuRate of [1, 4]) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
      await page.addInitScript(() => {
        const scope = window as unknown as { loadingPaintProbe: PaintProbe };
        scope.loadingPaintProbe = { fcp: 0, lcp: 0, webgl: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (entry.name === 'first-contentful-paint')
              scope.loadingPaintProbe.fcp = entry.startTime;
        }).observe({ type: 'paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) scope.loadingPaintProbe.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          ...args: Parameters<typeof getContext>
        ) {
          if (args[0].includes('webgl') && !scope.loadingPaintProbe.webgl)
            scope.loadingPaintProbe.webgl = performance.now();
          return getContext.apply(this, args);
        } as typeof getContext;
      });

      // Hold JavaScript on the first navigation to inspect the real document fallback.
      let release = () => undefined as void;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/*.js', async (route) => {
        await gate;
        await route.continue();
      });
      const navigation = page.goto(url);
      await page.getByText('Starting Scrapworks…', { exact: true }).waitFor();
      await page.waitForFunction(
        () => performance.getEntriesByName('first-contentful-paint').length > 0,
      );
      await accessible(page, axeSource);
      release();
      await navigation;
      await page.unroute('**/*.js');
      for (const attempt of [0, 1, 2]) {
        const cached = attempt === 2;
        if (attempt > 0) {
          await page.goto('about:blank');
          await page.goto(url);
        }
        await menuReady(page);
        await page.waitForLoadState('networkidle');
        assert(
          await page
            .getByRole('img', { name: 'Scrapworks', exact: true })
            .evaluate((image) => (image as HTMLImageElement).currentSrc.endsWith('/logo-640.webp')),
        );
        const sample = await page.evaluate((renderer) => {
          const resource = performance
            .getEntriesByType('resource')
            .find((entry) => entry.name.endsWith('/' + renderer)) as
            PerformanceResourceTiming | undefined;
          return {
            ...(window as unknown as { loadingPaintProbe: PaintProbe }).loadingPaintProbe,
            rendererRequest: resource?.startTime ?? 0,
            rendererTransferSize: resource?.transferSize ?? -1,
          };
        }, chunks.renderer);
        assert(
          sample.fcp > 0 && sample.fcp < sample.webgl,
          'FCP must precede WebGL initialization',
        );
        assert(
          sample.rendererRequest > sample.fcp,
          'The renderer module must be requested after first paint',
        );
        if (cached)
          assert.equal(sample.rendererTransferSize, 0, 'Warm startup must use the cached renderer');
        samples.push({ ...sample, cpuRate, cached });
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }

  await fs.writeFile(
    path.join(output, 'loading-metrics.json'),
    JSON.stringify({ chunks, samples }, null, 2),
  );

  for (const asset of ['scene', 'character', 'worker'] as const) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 240 },
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(url);
      await menuReady(page);
      assert(
        await page
          .getByRole('img', { name: 'Scrapworks', exact: true })
          .evaluate((image) => (image as HTMLImageElement).currentSrc.endsWith('/logo-320.webp')),
      );

      let release = () => undefined as void;

      let requested = () => undefined as void;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        requested = resolve;
      });
      const pattern =
        asset === 'scene'
          ? '**/game.babylon'
          : asset === 'character'
            ? '**/protagonist-v3.glb'
            : '**/worker-*.js';
      await page.route(pattern, async (route) => {
        requested();
        await gate;
        await route.continue();
      });
      await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
      await started;
      await covered(page);
      assert(
        await page
          .getByRole('img', { name: 'Scrapworks', exact: true })
          .evaluate((image) => (image as HTMLImageElement).currentSrc.endsWith('/logo-320.webp')),
      );
      await page.locator('[data-loading-focus]:focus').waitFor();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert(
        await page.evaluate(() => {
          const task = document.querySelector('.loading-task')!;
          const bounds = task.getBoundingClientRect();
          return (
            bounds.top >= 0 &&
            bounds.bottom <= innerHeight &&
            getComputedStyle(document.querySelector('.loading-fill')!).animationName === 'none'
          );
        }),
      );
      await accessible(page, axeSource);
      await page.screenshot({ path: path.join(output, `loading-${asset}.png`) });
      release();
      await page
        .locator('app-game-page app-loading-screen')
        .waitFor({ state: 'detached', timeout: 30000 });
      await page.locator('canvas:focus').waitFor();
      await accessible(page, axeSource);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await menuReady(page);
    await page.route('**/protagonist-v3.glb', (route) =>
      route.fulfill({ status: 404, body: 'Missing character fixture' }),
    );
    await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await covered(page);
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(await page.locator('[data-retry]:focus').count(), 1);
    await accessible(page, axeSource);
    await page.screenshot({ path: path.join(output, 'loading-error.png') });
    await page.unroute('**/protagonist-v3.glb');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await menuReady(page);
  } finally {
    await context.close();
  }
  return { chunks, samples };
}
