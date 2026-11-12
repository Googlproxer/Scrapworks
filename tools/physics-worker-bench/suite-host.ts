import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { root, reportRoot, digest } from './prepare.ts';
import { requireLocal } from './protocol.ts';
import { jobs, type RenderJob, type ScheduleKind } from './render-jobs.ts';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
requireLocal();
const preparation = JSON.parse(await fs.readFile(path.join(reportRoot, 'preparation.json'), 'utf8')) as { id: string; originalB0: string; variants: Record<string, { artifact: string }> };
const output = path.join(root, 'docs/reports/split-physics-worker/2026-11-11');
await fs.mkdir(output, { recursive: true });
try { const diagnostics = JSON.parse(await fs.readFile(path.join(output, 'diagnostic-preparation.json'), 'utf8')) as { primaryPreparation: string; variants: typeof preparation.variants }; if (diagnostics.primaryPreparation !== preparation.id) throw new Error('Contact diagnostics use a different primary preparation'); Object.assign(preparation.variants, diagnostics.variants); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const workers: Record<string, string> = {};
for (const [variant, value] of Object.entries(preparation.variants)) {
  const stats = JSON.parse(await fs.readFile(path.join(value.artifact, 'browser-stats.json'), 'utf8')) as { outputs: Record<string, { entryPoint?: string }> };
  const worker = Object.entries(stats.outputs).find(([, entry]) => entry.entryPoint?.endsWith('/workers/simulation.worker.ts'));
  if (!worker) throw new Error(`Worker entry missing: ${variant}`);
  workers[variant] = `/artifacts/${variant}/${worker[0]}`;
}
const bundled = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/suite-browser.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', tsconfig: path.join(root, 'tsconfig.json'), logLevel: 'warning' });
const fault = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/fault-wrapper.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', logLevel: 'warning' });
const render = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/render-browser.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', logLevel: 'warning' });
const bootstrap = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/render-bootstrap.ts')], bundle: true, write: false, format: 'iife', target: 'esnext', logLevel: 'warning' });
const supplements = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/supplement-browser.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', logLevel: 'warning' });
const overhead = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/overhead-browser.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', logLevel: 'warning' });
const saveAudit = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/save-audit-browser.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', logLevel: 'warning' });
const focusControl = await build({ entryPoints: [path.join(root, 'tools/physics-worker-bench/focus-browser.ts')], bundle: true, write: false, format: 'esm', target: 'esnext', logLevel: 'warning' });
async function primaryScript(name: string, fallback: Uint8Array): Promise<Uint8Array> { try { return await fs.readFile(path.join(output, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return fallback; } }
const primaryRender = await primaryScript('primary-render-helper.js', render.outputFiles[0].contents);
const primaryBootstrap = await primaryScript('primary-input-bootstrap.js', bootstrap.outputFiles[0].contents);
const authored = JSON.parse(await fs.readFile(path.join(root, 'public/scene/worlds/game.json'), 'utf8')) as unknown;
let task = 'correctness', soakSeconds = 1800, matrixTicks = 200;
let replayBrowser = 'bundled';
let soakSpec: import('./fixtures.ts').WorkloadSpec | undefined;
let renderJobs: RenderJob[] = [], jobIndex = 0;
let fixtureModules: Promise<{ builder: InstanceType<typeof import('./fixtures.ts').FixtureBuilder>; save: typeof import('../../tests/support/save-fixture.ts').saveFixture; contact: typeof import('./contact-fixtures.ts').contactFixture }> | undefined;
const fixtureCache = new Map<string, SaveSnapshot>();
async function fixture(job: RenderJob): Promise<SaveSnapshot | undefined> {
  if (!job.spec && !job.course) return undefined;
  const key = JSON.stringify({ spec: job.spec, course: job.course });
  let value = fixtureCache.get(key);
  if (!value) {
    fixtureModules ??= (async () => {
      const modules = await createServer({ configFile: false, root, resolve: { tsconfigPaths: true }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
      const types = await modules.ssrLoadModule('/tools/physics-worker-bench/fixtures.ts') as typeof import('./fixtures.ts');
      const saves = await modules.ssrLoadModule('/tests/support/save-fixture.ts') as typeof import('../../tests/support/save-fixture.ts');
      const contacts = await modules.ssrLoadModule('/tools/physics-worker-bench/contact-fixtures.ts') as typeof import('./contact-fixtures.ts');
      return { builder: new types.FixtureBuilder(authored as import('../../src/contracts/world.ts').WorldDefinition), save: saves.saveFixture, contact: contacts.contactFixture };
    })();
    const module = await fixtureModules;
    value = module.save(job.course ? module.contact(authored as import('../../src/contracts/world.ts').WorldDefinition, job.course) : module.builder.build(job.spec!), `bench-${job.case}`, `bench-${job.case}-initial`);
    fixtureCache.set(key, value);
    await fs.writeFile(path.join(output, `fixture-${job.case}.json`), JSON.stringify(value));
  }
  return value;
}
function jobUrl(job: RenderJob): string {
  return `/play/${job.variant}/?` + new URLSearchParams({ scheduled: '1', job: job.id, device: job.device, cycles: String(job.cycles), hold: String(job.hold), seed: String(job.seed), fixture: job.spec || job.course ? '1' : '0', fault: job.fault ?? 'none', mode: job.mode ?? 'latency', case: job.case, run: String(job.run), pressure: job.pressure ?? '', axis: job.axis ?? 'vertical', contactProbe: job.course ? '1' : '0', fixedCamera: job.fixedCamera ? '1' : '0', supportId: job.supportId ?? '' }).toString();
}
async function queueStatus() { await fs.writeFile(path.join(output, 'render-queue.json'), JSON.stringify({ total: renderJobs.length, completed: jobIndex, current: renderJobs[jobIndex] ?? null, jobs: renderJobs }, null, 2)); }
const port = Number(process.argv[2] ?? 4319);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'POST') {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length; if (size > 134217728) throw new Error('Receipt too large'); chunks.push(bytes); }
      const body = Buffer.concat(chunks).toString();
      if (url.pathname === '/event') { const value = JSON.parse(body) as { kind: string; data: unknown }; await fs.appendFile(path.join(output, `${task}-events.jsonl`), JSON.stringify({ ...value, preparation: preparation.id, harnessSha256: digest(bundled.outputFiles[0].contents) }) + '\n'); console.log(JSON.stringify({ kind: value.kind, variant: (value.data as { variant?: string }).variant, key: (value.data as { key?: string }).key })); }
      else if (url.pathname.startsWith('/trace/')) { const name = decodeURIComponent(url.pathname.slice(7)); if (!/^[a-zA-Z0-9-]+$/.test(name)) throw new Error('Invalid trace name'); await fs.appendFile(path.join(output, name + '-trace.jsonl'), body); }
      else if (url.pathname.startsWith('/capture/')) { const name = decodeURIComponent(url.pathname.slice(9)); if (!/^[a-zA-Z0-9-]+$/.test(name)) throw new Error('Invalid receipt name'); await fs.writeFile(path.join(output, name + '.json'), body); }
      else throw new Error('Unknown receipt route');
      response.end('ok'); return;
    }
    if (url.pathname === '/selection') { response.setHeader('Content-Type', 'application/json'); response.end(await fs.readFile(path.join(output, url.searchParams.get('steady') === '1' ? 'steady-soak-selection.json' : url.searchParams.get('browser') === 'firefox' ? 'firefox-run-selection.json' : 'bundled-run-selection.json'))); return; }
    if (url.pathname === '/config') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ workers, authored, task, soakSeconds, matrixTicks, spec: soakSpec, replayBrowser, preparation: preparation.id })); return; }
    if (url.pathname === '/schedule') {
      const kind = url.searchParams.get('kind'); if (!['validation', 'baseline', 'latency', 'supplement', 'overhead', 'pressure', 'fixture-smoke', 'contacts', 'corner', 'contacts-corrected'].includes(kind ?? '')) throw new Error('Unknown render schedule');
      if ((kind === 'contacts' || kind === 'corner' || kind === 'contacts-corrected') && !preparation.variants['B0-contact']) throw new Error('Build the separate contact diagnostics before configuring this schedule');
      renderJobs = jobs(kind as ScheduleKind); if (kind === 'latency') { const selection = JSON.parse(await fs.readFile(path.join(output, url.searchParams.get('browser') === 'firefox' ? 'firefox-run-selection.json' : 'bundled-run-selection.json'), 'utf8')) as { selected: { spec: import('./fixtures.ts').WorkloadSpec } }; renderJobs = renderJobs.map(job => job.case === 'largest-mixed' ? { ...job, spec: selection.selected.spec } : job); } if (url.searchParams.get('browser') === 'firefox') renderJobs = renderJobs.map(job => ({ ...job, id: job.id.replace(kind + '-', kind + '-firefox-') })); jobIndex = 0; await queueStatus(); await fs.writeFile(path.join(output, `schedule-${kind}-${Date.now()}.json`), JSON.stringify(renderJobs, null, 2));
      response.setHeader('Content-Type', 'text/html'); response.end(`<html><h1>Local ${kind} schedule ready</h1><a href="${jobUrl(renderJobs[0])}">Start configured render schedule (${renderJobs.length} jobs)</a></html>`); return;
    }
    if (url.pathname === '/next') {
      if (renderJobs[jobIndex]?.id !== url.searchParams.get('completed')) throw new Error('Render job completion mismatch');
      ++jobIndex; await queueStatus(); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ url: renderJobs[jobIndex] ? jobUrl(renderJobs[jobIndex]) : null })); return;
    }
    if (url.pathname === '/current') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ url: renderJobs[jobIndex] ? jobUrl(renderJobs[jobIndex]) : null })); return; }
    if (url.pathname === '/metadata') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ preparation, runtimeScripts: { input: digest(bootstrap.outputFiles[0].contents), render: digest(render.outputFiles[0].contents), primaryInput: digest(primaryBootstrap), primaryRender: digest(primaryRender), supplement: digest(supplements.outputFiles[0].contents), overhead: digest(overhead.outputFiles[0].contents), suite: digest(bundled.outputFiles[0].contents) } })); return; }
    if (url.pathname === '/fixture') { const current = renderJobs.find(job => job.id === url.searchParams.get('job')); if (!current) throw new Error('Unknown fixture job'); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await fixture(current))); return; }
    if (url.pathname === '/task') { const next = url.searchParams.get('name'); if (!['steady-parity', 'corner-parity', 'selected-correctness', 'correctness', 'contact-parity', 'courses', 'ordering', 'matrix', 'faults', 'lifecycle', 'soak', 'isolation', 'edits', 'accepted', 'research'].includes(next ?? '')) throw new Error('Unknown task'); task = next!; soakSeconds = Number(url.searchParams.get('seconds') ?? 1800); matrixTicks = Number(url.searchParams.get('ticks') ?? 200); if (url.searchParams.has('spec')) soakSpec = JSON.parse(url.searchParams.get('spec')!) as typeof soakSpec; replayBrowser = url.searchParams.get('browser') === 'firefox' ? 'firefox' : 'bundled'; response.end('Task configured: ' + task); return; }
    if (url.pathname === '/replay-index' || url.pathname.startsWith('/replay/')) { const name = url.pathname === '/replay-index' ? 'index.json' : decodeURIComponent(url.pathname.slice('/replay/'.length)); if (!/^[a-zA-Z0-9-]+\.json$/.test(name)) throw new Error('Invalid replay receipt name'); response.setHeader('Content-Type', 'application/json'); response.end(await fs.readFile(path.join(output, 'replay-plans', name))); return; }
    if (url.pathname === '/suite.js' || url.pathname === '/fault-worker.js') { response.setHeader('Content-Type', 'text/javascript'); response.end((url.pathname === '/suite.js' ? bundled : fault).outputFiles[0].contents); return; }
    if (url.pathname === '/render-probe.js' || url.pathname === '/input-bootstrap.js') { response.setHeader('Content-Type', 'text/javascript'); response.end((url.pathname === '/render-probe.js' ? render : bootstrap).outputFiles[0].contents); return; }
    if (url.pathname === '/primary-render-probe.js' || url.pathname === '/primary-input-bootstrap.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(url.pathname === '/primary-render-probe.js' ? primaryRender : primaryBootstrap); return; }
    if (url.pathname === '/supplement-probe.js' || url.pathname === '/overhead-probe.js') { response.setHeader('Content-Type', 'text/javascript'); response.end((url.pathname === '/supplement-probe.js' ? supplements : overhead).outputFiles[0].contents); return; }
    if (url.pathname === '/injected-worker-failure.js') { response.setHeader('Content-Type', 'text/javascript'); response.end('throw new Error("Injected renderer worker preparation failure")'); return; }
    if (url.pathname === '/save-audit.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(saveAudit.outputFiles[0].contents); return; }
    if (url.pathname === '/focus-probe.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(focusControl.outputFiles[0].contents); return; }
    if (url.pathname === '/audit-saves') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><h1>Local experiment save audit</h1><button id="start">Export experiment saves for native audit</button><pre id="status">Only this origin and the ScrapworksPhysicsBench- prefix are included.</pre><script type="module" src="/save-audit.js"></script></html>'); return; }
    if (url.pathname.startsWith('/artifacts/') || url.pathname.startsWith('/play/')) {
      const [, , variant, ...parts] = url.pathname.split('/'); const directory = variant === 'B0-plain' ? preparation.originalB0 : path.join(preparation.variants[variant].artifact, 'browser'); const file = path.resolve(directory, ...parts);
      if (url.pathname.startsWith('/play/') && (!parts.join('/') || parts.join('/') === 'index.html')) {
        const mode = url.searchParams.get('mode'), primary = !['supplement', 'overhead', 'focus'].includes(mode ?? '') && url.searchParams.get('contactProbe') !== '1' && !url.searchParams.get('pressure');
        const script = primary ? '/primary-render-probe.js' : mode === 'supplement' ? '/supplement-probe.js' : mode === 'overhead' ? '/overhead-probe.js' : mode === 'focus' ? '/focus-probe.js' : '/render-probe.js';
        const input = primary ? '/primary-input-bootstrap.js' : '/input-bootstrap.js';
        const html = (await fs.readFile(path.join(directory, 'index.html'), 'utf8')).replace('<base href="/">', `<base href="/play/${variant}/">`).replace('<head>', `<head><script src="${input}"></script>`).replace('</body>', `<script type="module" src="${script}"></script></body>`);
        response.setHeader('Content-Type', 'text/html'); response.end(html); return;
      }
      if (url.pathname.startsWith('/play/') && parts.join('/') === 'scene/worlds/game.json' && (renderJobs[jobIndex]?.spec || renderJobs[jobIndex]?.course)) { const saved = await fixture(renderJobs[jobIndex]); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(saved!.world.definition)); return; }
      if (!file.startsWith(directory + path.sep)) throw new Error('Path escapes artifact');
      const mime: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
      response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream'); response.end(await fs.readFile(file)); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Local physics-worker experiment</title><style>body{font:18px system-ui;background:#142025;color:#eef5f5;padding:32px}button{font:inherit;padding:14px 24px}pre{white-space:pre-wrap;min-height:240px}</style><h1>Local physics-worker experiment</h1><p>This PC only. No CI. Controlled fixture diagnostics; no physical input timing.</p><button id="start">Start configured stage</button><pre id="status">Loading native physics harness…</pre><script type="module" src="/suite.js"></script></html>');
  } catch (error) { response.writeHead(500).end(String(error)); }
});
server.listen(port, '127.0.0.1', () => console.log(`Suite ready at http://127.0.0.1:${port}/`));
