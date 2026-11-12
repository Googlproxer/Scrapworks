import { detectResponse, relativeToSupport, type ProbeAttempt, type ProbeResult } from './detector.ts';
import type { TraceEvent } from './browser-probe.ts';
import { distribution, seededRandom } from './statistics.ts';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import { installFrameImages } from './frame-images.ts';
import { ContactEngagement } from './contact-engagement.ts';
const parameters = new URL(location.href).searchParams;
const cycles = Number(parameters.get('cycles') ?? 5), hold = Number(parameters.get('hold') ?? 600);
const job = parameters.get('job') ?? `render-${Date.now()}`;
const scheduled = parameters.get('scheduled') === '1';
const device = parameters.get('device') === 'synthetic-gamepad' ? 'synthetic-gamepad' : 'keyboard';
const horizontal = parameters.get('axis') === 'horizontal';
const supportId = parameters.get('supportId') ?? undefined, contactProbe = parameters.get('contactProbe') === '1';
const images = contactProbe ? installFrameImages(job) : undefined;
const engagement = contactProbe ? new ContactEngagement(parameters.get('case') ?? '') : undefined;
const wallCourse = contactProbe && ['wall-corner', 'corner-contact'].includes(parameters.get('case') ?? '');
const seed = Number(parameters.get('seed') ?? 20261111);
const random = seededRandom(seed);
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const output = document.createElement('output');
output.setAttribute('aria-label', 'Experiment status');
output.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99999;background:#142025;color:#fff;padding:8px;font:13px system-ui;max-width:440px;pointer-events:none;min-height:32px';
document.body.append(output);
let started = false;
const attempts: ProbeAttempt[] = [], results: ProbeResult[] = [], frameMs: number[] = [];
let tail: TraceEvent[] = [], lastFrameTime: number | undefined, runStartedAt = 0;
let relativeIdleComponentMetres: ReturnType<typeof distribution> | null = null;
let contactIdleDisplacementMetres: ReturnType<typeof distribution> | null = null;
const detectionOptions = () => ({ windowEndedAt: performance.now(), supportId, releaseComponentOnly: contactProbe });
async function post(name: string, value: unknown) { const response = await fetch('/capture/' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); if (!response.ok) throw new Error('Local receipt write failed'); }
async function drain() {
  const sample = globalThis.__scrapworksPhysicsProbe!.drain(); tail.push(...sample.events);
  engagement?.observe(sample.events);
  const response = await fetch('/trace/' + encodeURIComponent(job), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sample.events.map(event => JSON.stringify(event)).join('\n') + '\n' });
  if (!response.ok || sample.dropped) throw new Error(`Trace receipt/overflow failure: ${sample.dropped}`);
  if (horizontal) for (const event of sample.events) if (event.stage === 'present' && (Number(event.data['x']) <= -2.2 || Number(event.data['x']) >= 5.8 || Math.abs(Number(event.data['z']) - 1) > .1)) throw new Error('Sustained probe left the validated free-space corridor; this run cannot qualify');
  for (const event of sample.events) if (event.stage === 'frame-submitted') { if (lastFrameTime !== undefined) frameMs.push(event.now - lastFrameTime); lastFrameTime = event.now; }
  if (frameMs.length > 500000) throw new Error('Frame sample bound reached');
  for (let i = attempts.length - 1; i >= 0; --i) { if (Math.hypot(attempts[i].direction.x, attempts[i].direction.z) === 0) continue; const result = detectResponse(attempts[i], tail, detectionOptions()); if (result.status !== 'pending') { results.push(result); attempts.splice(i, 1); if (images && result.id <= 3 && result.status === 'completed') await images.capture(result.operation + '-after-causal-response'); } }
  tail = tail.filter(event => event.now >= performance.now() - 5000);
  if (document.hidden || !document.hasFocus()) throw new Error('Foreground or focus lost');
  return sample.events;
}
function keyboard(code: string, down: boolean) { const codes: Record<string, number> = { KeyW: 87, KeyS: 83, KeyA: 65, KeyD: 68 }; const key = code.slice(-1).toLowerCase(); document.querySelector('canvas')!.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code, keyCode: codes[code], which: codes[code], bubbles: true, cancelable: true })); }
async function next() { if (!scheduled) return; const value = await (await fetch('/next?completed=' + encodeURIComponent(job))).json() as { url?: string }; if (value.url) location.href = value.url; }
async function history(): Promise<unknown[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('ScrapworksGameplaySaves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try { return await new Promise<unknown[]>((resolve, reject) => { const tx = db.transaction('revisions', 'readonly'), request = tx.objectStore('revisions').getAll(); tx.oncomplete = () => resolve(request.result as unknown[]); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
}
async function savedPayloads(): Promise<unknown[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('ScrapworksGameplaySaves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try { return await new Promise<unknown[]>((resolve, reject) => { const tx = db.transaction('payloads', 'readonly'), request = tx.objectStore('payloads').getAll(); tx.oncomplete = () => resolve(request.result as unknown[]); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
}
async function run() {
  output.textContent = 'Warming up the local render probe…'; await wait(15000);
  const startup = globalThis.__scrapworksPhysicsProbe!.drain();
  engagement?.startup(startup.events);
  if (supportId) { const frames = relativeToSupport(startup.events, supportId).filter(event => event.stage === 'present' && event.now >= performance.now() - 5000); relativeIdleComponentMetres = distribution(frames.slice(1).map((frame, index) => Math.abs(Number(frame.data['z']) - Number(frames[index].data['z'])))); }
  if (contactProbe) {
    const frames = (supportId ? relativeToSupport(startup.events, supportId) : startup.events).filter(event => event.stage === 'present' && event.now >= performance.now() - 5000);
    contactIdleDisplacementMetres = distribution(frames.slice(1).map((frame, index) => Math.hypot(Number(frame.data['x']) - Number(frames[index].data['x']), Number(frame.data['z']) - Number(frames[index].data['z']))));
    await post(job + '-idle', { supportId, relativeIdleComponentMetres, contactIdleDisplacementMetres, frozenEpsilonMetres: .0001, qualification: 'Idle excursions above the frozen epsilon leave contact response causality unqualified; thresholds are not raised to obtain a pass.' });
  }
  await post(job + '-startup', startup); runStartedAt = performance.now();
  if (images) await images.capture('idle-before-input');
  let direction: { x: number; z: number } | undefined, serial = 0;
  for (let cycle = 0; cycle < cycles; ++cycle) {
    const sign = cycle % 2 ? -1 : 1, forward = horizontal ? sign > 0 ? 'KeyD' : 'KeyA' : sign > 0 ? 'KeyW' : 'KeyS', reverse = horizontal ? sign > 0 ? 'KeyA' : 'KeyD' : sign > 0 ? 'KeyS' : 'KeyW';
    const forwardSide = sign > 0 ? 'KeyD' : 'KeyA', reverseSide = sign > 0 ? 'KeyA' : 'KeyD';
    for (const operation of ['start', 'reverse', 'release'] as const) {
      await wait(random() * 50); if (operation === 'reverse' && device === 'keyboard') { keyboard(forward, false); if (wallCourse) keyboard(forwardSide, false); }
      const id = ++serial, scale = operation === 'reverse' ? -sign : sign;
      const attempt: ProbeAttempt = { id, operation, device, direction: { x: (direction?.x ?? 0) * scale, z: (direction?.z ?? 0) * scale } }; attempts.push(attempt);
      globalThis.__scrapworksExperimentInput!.arm(id, operation, device);
      if (device === 'keyboard') { keyboard(operation === 'start' ? forward : reverse, operation !== 'release'); if (wallCourse) keyboard(operation === 'start' ? forwardSide : reverseSide, operation !== 'release'); } else { const value = operation === 'release' ? 0 : operation === 'start' ? sign : -sign; globalThis.__scrapworksExperimentInput!.setGamepad(horizontal || wallCourse ? value : 0, horizontal ? 0 : -value); }
      await wait(hold);
      if (!direction) {
        const sample = globalThis.__scrapworksPhysicsProbe!.drain(); const action = sample.events.find(event => event.stage === 'action' && Math.hypot(Number(event.data['x']), Number(event.data['z'])) > .01);
        engagement?.observe(sample.events);
        if (!action) throw new Error('Input did not traverse the production controller path'); direction = { x: Number(action.data['x']) / scale, z: Number(action.data['z']) / scale }; attempt.direction = { x: direction.x * scale, z: direction.z * scale }; tail.push(...sample.events);
        await fetch('/trace/' + encodeURIComponent(job), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sample.events.map(event => JSON.stringify(event)).join('\n') + '\n' });
      }
      await drain(); output.textContent = `${job}: ${cycle + 1}/${cycles}, ${operation}`;
    }
    if (cycle % 20 === 19) await post(job + '-progress', { cycles: cycle + 1, requested: cycles, completed: results.length, pending: attempts.length, elapsedMs: performance.now() - runStartedAt });
  }
  await wait(2100); await drain(); for (const attempt of attempts) results.push(detectResponse(attempt, tail, detectionOptions())); attempts.length = 0;
  const canvas = document.querySelector('canvas')!, gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
  const summary = Object.fromEntries(['start', 'reverse', 'release'].map(operation => [operation, distribution(results.filter(result => result.operation === operation && result.latencyMs !== null).map(result => result.latencyMs!))]));
  const clockSamples = Array.from({ length: 4096 }, () => performance.now()), positive = clockSamples.slice(1).map((value, index) => value - clockSamples[index]).filter(value => value > 0);
  await post('saved-' + job, { job, payloads: await savedPayloads() });
  await images?.flush();
  if (engagement) { const evidence = engagement.report(); await post(job + '-engagement', evidence); if (!evidence.pass) throw new Error('Contact fixture engagement was not established: ' + JSON.stringify(evidence)); }
  await post(job, { job, device, cycles, hold, seed, axis: horizontal ? 'horizontal' : 'vertical', contactProbe, contactProtocolVersion: contactProbe ? 2 : null, supportId, releaseComponentOnly: contactProbe, relativeIdleComponentMetres, fixedCamera: parameters.get('fixedCamera') === '1', contactQualification: contactProbe ? 'Small diagnostic cohort; no sustained p99 qualification. Support translation/component semantics are explicit.' : null, freeSpaceCorridor: horizontal ? { minX: -2.2, maxX: 5.8, z: 1, zTolerance: .1 } : null, case: parameters.get('case'), run: parameters.get('run'), probeVersion: globalThis.__scrapworksPhysicsProbe!.version, metadata: await (await fetch('/metadata')).json(), timerResolutionMs: positive.length ? Math.min(...positive) : null, elapsedMs: performance.now() - runStartedAt, syntheticKeyboard: device === 'keyboard', physicalInputTiming: false, freshBrowserProcess: false, userAgent: navigator.userAgent, hidden: document.hidden, focused: document.hasFocus(), viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, renderer: debug ? gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, summary, frames: distribution(frameMs), results, savedHistory: await history() });
  output.textContent = `Completed ${job}: ${results.filter(result => result.status === 'completed').length}/${results.length} probes.`; await next();
}
async function fail(error: unknown) { output.textContent = `Experiment failed: ${String(error)}`; await post(job + '-failure', { error: String(error), stack: error instanceof Error ? error.stack : null, attempted: [...results, ...attempts], elapsedMs: performance.now() - runStartedAt }); await next(); }
output.textContent = 'Experiment: New Game/Continue, then click the clear viewport to begin.';
document.addEventListener('pointerdown', event => { if (started || !(event.target instanceof HTMLCanvasElement) || !globalThis.__scrapworksPhysicsProbe) return; started = true; void run().catch(fail); });
async function until(predicate: () => boolean) { const start = performance.now(); while (!predicate()) { if (performance.now() - start > 45000) throw new Error('App preparation timed out'); await wait(100); } }
function readyButton(label: string): HTMLButtonElement | undefined { return Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === label && !button.disabled && !button.closest('[inert]') && button.getClientRects().length > 0); }
async function automatic() {
  await until(() => !!readyButton('New Game') || !!readyButton('Continue'));
  if (parameters.get('fixture') === '1' && !sessionStorage.getItem('seeded-' + job)) {
    const save = await (await fetch('/fixture?job=' + encodeURIComponent(job))).json() as SaveSnapshot;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('ScrapworksGameplaySaves'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(['revisions', 'payloads', 'runs'], 'readwrite'); const { world: _world, ...metadata } = save; tx.objectStore('revisions').put(metadata); tx.objectStore('payloads').put({ token: save.token, payload: save }); tx.objectStore('runs').put({ runId: save.runId, token: save.token, sequence: save.sequence }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
    sessionStorage.setItem('seeded-' + job, '1'); location.reload(); return;
  }
  const label = parameters.get('fixture') === '1' ? 'Continue' : 'New Game';
  await until(() => !!readyButton(label));
  const button = readyButton(label);
  if (!button) throw new Error('Missing app start control ' + label); button.click(); await until(() => !!document.querySelector('[data-objective-title]'));
  const canvas = document.querySelector('canvas')!; canvas.focus(); const rect = canvas.getBoundingClientRect(), point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true };
  canvas.dispatchEvent(new PointerEvent('pointerdown', { ...point, buttons: 1 })); canvas.dispatchEvent(new PointerEvent('pointerup', { ...point, buttons: 0 }));
}
if (scheduled) void automatic().catch(fail);
