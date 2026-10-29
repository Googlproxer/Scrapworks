import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.resolve(root, 'tmp/simulation-worker-bench/angular-packaging');
if (!output.startsWith(path.join(root, 'tmp') + path.sep))
  throw new Error('Packaging output escaped tmp');
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
    'build',
    '--configuration',
    'production',
    '--browser',
    'tools/simulation-worker-bench/browser.ts',
    '--index',
    'tools/simulation-worker-bench/angular-probe.html',
    '--ts-config',
    'tools/simulation-worker-bench/angular-probe.json',
    '--web-worker-ts-config',
    'tools/simulation-worker-bench/angular-probe.json',
    '--base-href',
    '/lab/',
    '--output-path',
    output,
    '--stats-json',
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
const folder = path.join(output, 'browser');
const html = await fs.readFile(path.join(folder, 'angular-probe.html'), 'utf8');
const hashes = (tag) =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))]
    .filter((match) => match[1].trim())
    .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
    .join(' ');
const csp = `default-src 'none'; script-src 'self' ${hashes('script')}; worker-src 'self'; connect-src 'self'; style-src 'self' ${hashes('style')}; img-src 'self' data:`;
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/lab/')) {
      response.writeHead(404).end();
      return;
    }
    const file = path.resolve(folder, '.' + decodeURIComponent(pathname.slice(4)));
    if (!file.startsWith(folder + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Content-Security-Policy', csp);
    response.setHeader(
      'Content-Type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'application/json',
    );
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
if (process.platform === 'win32' && !process.env.PLAYWRIGHT_BROWSERS_PATH)
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'AppData/Local/ms-playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/lab/angular-probe.html`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => !!window.simulationWorkerBench);
  const results = [];
  for (const candidate of ['miniplex', 'bitecs'])
    results.push(
      await page.evaluate(async (candidate) => {
        const options = {
          candidate,
          execution: 'worker',
          size: 1000,
          seed: 1729,
          workload: 'mixed',
          wire: 'object',
          ticks: 20,
          warmupMs: 0,
          warmupTicks: 2,
        };
        const result = await window.simulationWorkerBench.trial(options);
        const paced = await window.simulationWorkerBench.paced({
          ...options,
          durationMs: 1000,
          pressureMs: 0,
        });
        return {
          candidate,
          status: result.status,
          ticks: result.measuredTicks,
          hash: result.hash,
          frames: paced.frames,
          inputAcknowledgements: paced.statistics.inputToVisible?.count ?? 0,
        };
      }, candidate),
    );
  await page.evaluate(
    await fs.readFile(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8'),
  );
  const axe = await page.evaluate(async () => window.axe.run());
  const record = {
    recordedAt: new Date().toISOString(),
    base: '/lab/',
    csp,
    results,
    errors,
    a11y: {
      violations: axe.violations,
      passes: axe.passes.length,
      incomplete: axe.incomplete.map((item) => item.id),
    },
  };
  await page.screenshot({ path: path.join(output, 'browser-smoke.png'), fullPage: true });
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(record, null, 2));
  if (
    errors.length ||
    axe.violations.length ||
    results.some((r) => r.status !== 'ok' || r.ticks !== 20 || !r.inputAcknowledgements)
  )
    throw new Error('Packaging/browser/a11y check failed');
  console.log(JSON.stringify(record));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
