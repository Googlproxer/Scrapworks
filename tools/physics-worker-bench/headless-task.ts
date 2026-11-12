import fs from 'node:fs/promises';
import path from 'node:path';
import { firefox, chromium } from 'playwright';
import { requireRunRelease } from './protocol.ts';
requireRunRelease(process.argv.includes('--start-authorized'));
const browserName = process.argv.includes('--firefox') ? 'firefox' : 'chromium';
const at = process.argv.indexOf('--task'), task = at < 0 ? 'correctness' : process.argv[at + 1];
if (!['steady-parity', 'corner-parity', 'selected-correctness', 'correctness', 'courses', 'ordering', 'accepted', 'matrix', 'faults', 'lifecycle'].includes(task ?? '')) throw new Error('Unknown worker diagnostic task');
const origin = 'http://127.0.0.1:4319', directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
const configured = await fetch(origin + '/task?' + new URLSearchParams({ name: task!, browser: browserName === 'firefox' ? 'firefox' : 'bundled' }));
if (!configured.ok) throw new Error('Local worker task configuration failed');
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage();
// Large synchronous reference continuations can occupy the diagnostic page for minutes.
page.setDefaultTimeout(600000);
const errors: string[] = [], started = Date.now();
page.on('pageerror', error => errors.push(String(error)));
let status = '', previous = '', failed: string | null = null;
try {
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start configured stage' }).click();
  while (Date.now() - started < 3600000) {
    status = await page.locator('#status').textContent() ?? '';
    if (status !== previous) { console.log(status); previous = status; }
    if (status.startsWith('suite-complete:')) break;
    if (status.startsWith('suite-fatal:')) throw new Error(status);
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
  }
  if (!status.startsWith('suite-complete:')) throw new Error('Worker task exceeded one-hour bound');
} catch (error) { failed = String(error); }
finally {
  await fs.writeFile(path.join(directory, `headless-${browserName}-${task}-${started}.json`), JSON.stringify({ browserName, browserVersion: browser.version(), task, status, failed, errors, elapsedMs: Date.now() - started, headless: true, freshBrowserProcess: true }, null, 2));
  await browser.close();
}
if (failed) throw new Error(failed);
