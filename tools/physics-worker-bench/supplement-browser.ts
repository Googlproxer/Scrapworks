import type { TraceEvent } from './browser-probe.ts';
const parameters = new URL(location.href).searchParams, job = parameters.get('job')!;
const device = parameters.get('device') ?? 'keyboard';
const reconnectOnly = parameters.get('control') === 'reconnect-only';
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const status = document.createElement('output');
status.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99999;background:#142025;color:white;padding:8px;min-height:30px;pointer-events:none';
status.setAttribute('aria-label', 'Supplemental experiment status'); document.body.append(status);
const results: unknown[] = [];
let id = 0;
async function until(predicate: () => boolean) { const start = performance.now(); while (!predicate()) { if (performance.now() - start > 45000) throw new Error('Supplemental preparation timed out'); await wait(100); } }
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(value => value.textContent?.trim() === label && !value.disabled && !value.closest('[inert]') && value.getClientRects().length); }
function key(code: string, down: boolean) { const codes: Record<string, number> = { KeyW: 87, KeyS: 83, KeyA: 65, KeyD: 68, ShiftLeft: 16 }; document.querySelector('canvas')!.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'ShiftLeft' ? 'Shift' : code.slice(-1).toLowerCase(), keyCode: codes[code], which: codes[code], bubbles: true, cancelable: true })); }
function input(x: number, z: number) { if (device === 'synthetic-gamepad') globalThis.__scrapworksExperimentInput!.setGamepad(x, z); else { key('KeyW', z < 0); key('KeyS', z > 0); key('KeyA', x < 0); key('KeyD', x > 0); } }
function sprint(down: boolean) { if (device === 'keyboard') key('ShiftLeft', down); else (globalThis.__scrapworksExperimentInput as unknown as { setButton(index: number, value: number): void }).setButton(10, down ? 1 : 0); }
function focus() { const canvas = document.querySelector('canvas')!; canvas.focus(); const rect = canvas.getBoundingClientRect(), options = { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, button: 0, buttons: 1, bubbles: true }; canvas.dispatchEvent(new PointerEvent('pointerdown', options)); canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 })); }
async function record(name: string, action: () => Promise<void>) {
  status.textContent = `${job}: ${name}`; globalThis.__scrapworksPhysicsProbe!.drain();
  globalThis.__scrapworksExperimentInput!.arm(++id, name, device);
  const begin = performance.now(); await action(); await wait(250);
  const trace = globalThis.__scrapworksPhysicsProbe!.drain();
  const actions = trace.events.filter(event => event.stage === 'action'), submissions = trace.events.filter(event => event.stage === 'input-submitted' && event.data['operation'] === 'advance');
  const movement = actions.filter(event => Math.hypot(Number(event.data['x']), Number(event.data['z'])) > .001);
  const frame = (events: TraceEvent[]) => events.filter(event => event.stage === 'present').map(event => ({ now: event.now, ...event.data }));
  results.push({ name, id, elapsedMs: performance.now() - begin, actionSamples: actions.length, movingActions: movement.length, submitted: submissions.length, sprintActions: actions.filter(event => event.data['sprint']).length, presented: frame(trace.events), dropped: trace.dropped });
  const response = await fetch('/trace/' + encodeURIComponent(job), { method: 'POST', body: trace.events.map(event => JSON.stringify(event)).join('\n') + '\n' }); if (!response.ok || trace.dropped) throw new Error('Supplemental trace receipt failed');
}
function controlMarker(name: string) { const at = performance.now(); results.push({ name, at }); globalThis.__scrapworksPhysicsProbe!.mark('supplement-control', { name, at }); }
async function reconnect() {
  await record('disconnect-reconnect-held', async () => {
    input(0, -1); await wait(400);
    controlMarker('disconnect'); globalThis.__scrapworksExperimentInput!.setGamepad(0, -1, false); await wait(400);
    controlMarker('reconnect'); globalThis.__scrapworksExperimentInput!.setGamepad(0, -1, true); await wait(400);
    controlMarker('neutral-after-reconnect'); input(0, 0); await wait(150);
    controlMarker('fresh-after-reconnect'); input(0, 1); await wait(400); input(0, 0);
  });
}
async function next() { if (parameters.get('scheduled') !== '1') return; const value = await (await fetch('/next?completed=' + encodeURIComponent(job))).json() as { url?: string }; if (value.url) location.href = value.url; }
async function finish() {
  await fetch('/capture/' + encodeURIComponent(job), { method: 'POST', body: JSON.stringify({ job, device, results, physical: false, qualification: 'Supplemental control-path diagnostics; taps are measured separately from sustained latency. Inspect raw action/submission/presentation traces for stale input and registration.' }) });
  status.textContent = `Completed ${job}: ${results.length} input conditions`;
  await next();
}
async function run() {
  await until(() => !!button('New Game') || !!document.querySelector('[data-retry]'));
  if (document.querySelector('[data-retry]')) { results.push({ name: 'renderer-retry', observedFailure: true }); (document.querySelector('[data-retry]') as HTMLButtonElement).click(); await until(() => !!button('New Game')); }
  button('New Game')!.click();
  let retried = false;
  await until(() => {
    if (document.querySelector('[data-retry]') && !retried) { retried = true; results.push({ name: 'renderer-retry', observedFailure: true }); (document.querySelector('[data-retry]') as HTMLButtonElement).click(); }
    if (retried && button('New Game')) button('New Game')!.click();
    return !!document.querySelector('[data-objective-title]');
  }); focus(); await wait(15000);
  if (reconnectOnly) { if (device !== 'synthetic-gamepad') throw new Error('Reconnect control requires the synthetic gamepad'); await reconnect(); await finish(); return; }
  for (const duration of [20, 40, 60, 100]) for (let repeat = 0; repeat < 20; ++repeat) await record(`tap-${duration}-${repeat}`, async () => { input(0, repeat % 2 ? 1 : -1); await wait(duration); input(0, 0); await wait(200); });
  await record('diagonal-sprint', async () => { input(1, -1); await wait(400); sprint(true); await wait(600); sprint(false); input(-1, 1); await wait(600); input(0, 0); });
  if (device === 'synthetic-gamepad') {
    for (const value of [0, .05, .1, .15, .2, .25, .3, .5, 1, -1, 0]) await record('analog-' + value, async () => { input(0, value); await wait(350); });
    await reconnect();
  }
  await record('pause-held-fresh-input', async () => { input(0, -1); await wait(400); button('Menu')!.click(); await until(() => !!button('Resume game')); await wait(500); button('Resume game')!.click(); focus(); await wait(500); input(0, 0); await wait(200); input(0, 1); await wait(400); input(0, 0); });
  await record('zero-size-viewport', async () => { const host = document.querySelector<HTMLElement>('.game-container')!; input(0, -1); await wait(300); const old = host.style.cssText; host.style.display = 'none'; await wait(700); results.push({ name: 'hidden-renderer-host', width: host.getBoundingClientRect().width, height: host.getBoundingClientRect().height }); host.style.cssText = old; focus(); await wait(400); input(0, 0); await wait(200); input(0, 1); await wait(300); input(0, 0); });
  await record('manual-save-load', async () => {
    input(0, -1); await wait(300); const toggle = document.querySelector<HTMLElement>('app-gameplay-saves details > summary')!; toggle.click(); await until(() => !!button('Save game')); button('Save game')!.click(); await until(() => !!button('Load selected revision')); await wait(500); button('Load selected revision')!.click(); await wait(300); button('Confirm')?.click(); await wait(1800); input(0, 0); toggle.click(); focus(); await wait(200); input(0, 1); await wait(400); input(0, 0);
  });
  await finish();
}
void run().catch(async error => { status.textContent = String(error); await fetch('/capture/' + encodeURIComponent(job + '-failure'), { method: 'POST', body: JSON.stringify({ job, error: String(error), results }) }); await next(); });
