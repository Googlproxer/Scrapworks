import fs from 'node:fs/promises';
import path from 'node:path';
import { firefox, chromium } from 'playwright';
import { requireRunRelease } from './protocol.ts';
requireRunRelease(process.argv.includes('--start-authorized'));
const browserName = process.argv.includes('--firefox') ? 'firefox' : 'chromium';
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
const origin = 'http://127.0.0.1:4319';
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
interface Current { total: number; completed: number; current: { id: string; variant: string; device: string } | null }
const failures: unknown[] = [];
let run = 0, successfulRuns = 0, consecutiveStartupFailures = 0;
for (;;) {
  const queue = JSON.parse(await fs.readFile(path.join(directory, 'render-queue.json'), 'utf8')) as Current;
  if (!queue.current) break;
  const id = queue.current.id, browser = await (browserName === 'firefox' ? firefox : chromium).launch({ headless: true });
  const browserVersion = browser.version(), context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  let completed = false;
  try {
    const current = await (await fetch(origin + '/current')).json() as { url: string };
    await page.goto(origin + current.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const start = Date.now();
    while (Date.now() - start < 600000) {
      const state = JSON.parse(await fs.readFile(path.join(directory, 'render-queue.json'), 'utf8')) as Current;
      if (state.current?.id !== id) { completed = true; break; }
      await wait(1000);
    }
    if (!completed) throw new Error('Headless job exceeded ten-minute acquisition bound');
    let result: Record<string, unknown>;
    try { result = JSON.parse(await fs.readFile(path.join(directory, id + '.json'), 'utf8')) as Record<string, unknown>; consecutiveStartupFailures = 0; }
    catch {
      result = JSON.parse(await fs.readFile(path.join(directory, id + '-failure.json'), 'utf8')) as Record<string, unknown>;
      const attempted = Array.isArray(result['attempted']) ? result['attempted'].length : 0;
      // A normal response/corridor failure must not be mislabeled as unsupported startup.
      consecutiveStartupFailures = attempted === 0 ? consecutiveStartupFailures + 1 : 0;
    }
    result['freshBrowserProcess'] = true; result['browserName'] = browserName; result['browserVersion'] = browserVersion; result['headless'] = true; result['browserErrors'] = errors;
    if (!result['error']) ++successfulRuns;
    await fs.writeFile(path.join(directory, id + (result['error'] ? '-failure.json' : '.json')), JSON.stringify(result));
    console.log(JSON.stringify({ run: ++run, browserName, id, completed: !result['error'], error: result['error'], results: Array.isArray(result['results']) ? result['results'].length : null }));
  } catch (error) { failures.push({ id, error: String(error), errors }); console.log(JSON.stringify(failures.at(-1))); break; }
  finally { await browser.close(); }
  if (consecutiveStartupFailures >= 2 && successfulRuns === 0) { failures.push({ reason: 'Two consecutive browser initialization failures with no successful acquisition; remaining render strata cannot run on this renderer.' }); break; }
}
const remaining = JSON.parse(await fs.readFile(path.join(directory, 'render-queue.json'), 'utf8')) as Current;
await fs.writeFile(path.join(directory, `headless-${browserName}-schedule.json`), JSON.stringify({ browserName, runs: run, successfulRuns, failures, remaining, physicalDisplayTiming: false }, null, 2));
