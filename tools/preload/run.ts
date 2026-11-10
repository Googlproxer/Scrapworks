import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { chromium, firefox, type Page } from 'playwright';
import { staticPreview } from '../portfolio/serve.ts';

interface LoadProbe {
  menu: number | null;
  clicked: number | null;
  playable: number | null;
  longTasks: { start: number; duration: number }[];
}

declare global {
  interface Window {
    preloadProbe: LoadProbe;
  }
}

if (process.env.CI || process.env.GITHUB_ACTIONS)
  throw new Error('Preload timing is local/manual only; never run in CI.');
const { values } = parseArgs({
  options: {
    browser: { type: 'string', default: 'all' },
    repetitions: { type: 'string', default: '5' },
    dwells: { type: 'string', default: '0,1000,3000,10000' },
    output: { type: 'string' },
    directory: { type: 'string', default: 'dist/scrapworks/browser' },
    headed: { type: 'boolean', default: false },
  },
});
if (!values.output) throw new Error('Use --output <local report.json>');
if (!['all', 'chromium', 'firefox'].includes(values.browser)) throw new Error('Unknown browser');
const repetitions = Number(values.repetitions);
const dwells = values.dwells.split(',').map(Number);
if (
  !Number.isInteger(repetitions) ||
  repetitions < 1 ||
  dwells.some((n) => !Number.isFinite(n) || n < 0 || n > 10000)
)
  throw new Error('Invalid repetitions or menu dwell');
const identity = createHash('sha256')
  .update(await fs.readFile(path.join(values.directory, '../browser-stats.json')))
  .digest('hex');
const server = staticPreview(values.directory);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const results: unknown[] = [];
async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const data: LoadProbe = { menu: null, clicked: null, playable: null, longTasks: [] };
    window.preloadProbe = data;
    performance.setResourceTimingBufferSize(5000);
    document.addEventListener(
      'click',
      (event) => {
        const button = (event.target as Element | null)?.closest('button');
        if (button && ['New Game', 'Continue'].includes(button.textContent?.trim() ?? ''))
          data.clicked = performance.now();
      },
      { capture: true, passive: true },
    );
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          data.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    const check = () => {
      const button = document.querySelector<HTMLButtonElement>('[data-play]');
      if (
        data.menu === null &&
        button &&
        !button.disabled &&
        !document.querySelector('app-loading-screen')
      )
        data.menu = performance.now();
      if (
        data.clicked !== null &&
        data.playable === null &&
        document.querySelector('.game-help') &&
        !document.querySelector('app-loading-screen') &&
        document.activeElement?.tagName === 'CANVAS'
      )
        data.playable = performance.now();
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    document.addEventListener('focusin', check);
  });
}
try {
  for (const engine of ['chromium', 'firefox'] as const) {
    if (values.browser !== 'all' && values.browser !== engine) continue;
    const browser = await (engine === 'chromium' ? chromium : firefox).launch({
      headless: !values.headed,
    });
    try {
      for (let repetition = 0; repetition < repetitions; repetition++)
        for (const dwell of dwells) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const page = await context.newPage();
          await instrument(page);
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(e.message));
          try {
            for (const operation of ['New Game', 'Continue'] as const) {
              if (operation === 'New Game') await page.goto(origin);
              else await page.reload();
              await page.waitForFunction(() => window.preloadProbe.menu !== null);
              // Intentional user dwell, not a readiness assumption or gameplay clock acceleration.
              if (dwell) await page.waitForTimeout(dwell);
              const warmWorkers = page.workers();
              const workersBefore = warmWorkers.length;
              await page.getByRole('button', { name: operation, exact: true }).click();
              await page.waitForFunction(() => window.preloadProbe.playable !== null, undefined, {
                timeout: 60000,
              });
              const sample = await page.evaluate(() => {
                const data = window.preloadProbe;
                return {
                  ...data,
                  clickToPlayableMs: data.playable! - data.clicked!,
                  resources: performance
                    .getEntriesByType('resource')
                    .filter((e) => /(?:worker-|protagonist-v3|worlds\/game)/.test(e.name))
                    .map((e) => {
                      const r = e as PerformanceResourceTiming;
                      return {
                        url: new URL(r.name).pathname,
                        start: r.startTime,
                        end: r.responseEnd,
                        transferred: r.transferSize,
                        decoded: r.decodedBodySize,
                      };
                    }),
                };
              });
              const row = {
                engine,
                browser: browser.version(),
                repetition,
                dwell,
                operation,
                workersBefore,
                workersAfter: page.workers().length,
                adoptedWarmWorker: warmWorkers.length
                  ? page.workers().includes(warmWorkers[0])
                  : null,
                errors: [...errors],
                ...sample,
              };
              results.push(row);
              if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
              console.log(
                JSON.stringify({
                  engine,
                  repetition,
                  dwell,
                  operation,
                  ms: sample.clickToPlayableMs,
                }),
              );
              if (operation === 'New Game') {
                await page
                  .locator('.top-right app-gameplay-saves summary')
                  .filter({ hasText: /^Save & load$/ })
                  .click();
                await page.getByRole('button', { name: 'Save game', exact: true }).click();
                await page
                  .locator('.compact-feedback')
                  .filter({ hasText: 'Game saved.' })
                  .waitFor();
              }
            }
          } finally {
            await context.close();
          }
        }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.mkdir(path.dirname(values.output), { recursive: true });
  await fs.writeFile(
    values.output,
    JSON.stringify(
      {
        protocol: 1,
        buildStatsSha256: identity,
        recordedAt: new Date().toISOString(),
        options: values,
        method:
          'Temporary browser contexts; Brotli static preview; actual click receipt to game DOM ready and focused viewport after the first game frame. Software readiness observation, not input-to-photon. Continue reuses that context cache and a new UI-created save. No pacing or gameplay progression route.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
}
