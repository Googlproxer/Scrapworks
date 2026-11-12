import type { TraceEvent } from './browser-probe.ts';
const parameters = new URL(location.href).searchParams, job = parameters.get('job')!, gamepad = parameters.get('device') === 'synthetic-gamepad';
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const output = document.createElement('div'); output.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99999;background:#142025;color:white;padding:12px;min-height:40px';
const status = document.createElement('output'), arm = document.createElement('button'); arm.textContent = 'Arm held input for focus test'; arm.disabled = true; output.append(status, arm); document.body.append(output);
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(value => value.textContent?.trim() === label && !value.disabled && !value.closest('[inert]')); }
function focus() { const canvas = document.querySelector('canvas')!; canvas.focus(); canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }
function input(down: boolean) { if (gamepad) globalThis.__scrapworksExperimentInput!.setGamepad(0, down ? -1 : 0); else document.querySelector('canvas')!.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: 'KeyW', key: 'w', keyCode: 87, which: 87, bubbles: true })); }
async function ready() { const start = performance.now(); while (!button('New Game')) { if (performance.now() - start > 45000) throw new Error('Focus app preparation failed'); await wait(100); } button('New Game')!.click(); while (!document.querySelector('[data-objective-title]')) await wait(100); focus(); await wait(15000); arm.disabled = false; status.textContent = 'Ready for real bundled-tab focus/visibility test.'; }
arm.addEventListener('click', () => {
  arm.disabled = true;
  void (async () => {
    focus(); globalThis.__scrapworksPhysicsProbe!.drain(); globalThis.__scrapworksExperimentInput!.arm(1, 'held-across-real-focus-loss', gamepad ? 'synthetic-gamepad' : 'keyboard'); input(true);
    await wait(400); status.textContent = 'Awaiting real focus loss. Open the owned focus-control tab, then return.';
    const deadline = performance.now() + 45000; while (document.hasFocus() && !document.hidden) { if (performance.now() > deadline) throw new Error('No real focus transition observed'); await wait(25); }
    const lost = performance.now(); while (!document.hasFocus() || document.hidden) { if (performance.now() > deadline) throw new Error('Focus was not restored'); await wait(25); }
    const returned = performance.now(); await wait(500); input(false); await wait(300); const neutral = performance.now(); input(true); await wait(500); input(false); await wait(250);
    const trace = globalThis.__scrapworksPhysicsProbe!.drain();
    const moving = (from: number, to: number) => trace.events.filter(event => event.now >= from && event.now <= to && event.stage === 'action' && Math.hypot(Number(event.data['x']), Number(event.data['z'])) > .001).length;
    const hiddenPublications = trace.events.filter(event => event.now > lost + 250 && event.now < returned && event.stage === 'publication').length;
    const staleMovingActions = moving(returned + 150, neutral - 10), freshMovingActions = moving(neutral, performance.now());
    const result = { job, gamepad, lost, returned, hiddenMs: returned - lost, staleMovingActions, freshMovingActions, hiddenPublications, dropped: trace.dropped, pass: returned - lost >= 500 && staleMovingActions === 0 && freshMovingActions > 0 && hiddenPublications === 0 && trace.dropped === 0 };
    await fetch('/trace/' + encodeURIComponent(job), { method: 'POST', body: trace.events.map((event: TraceEvent) => JSON.stringify(event)).join('\n') + '\n' }); await fetch('/capture/' + encodeURIComponent(job), { method: 'POST', body: JSON.stringify(result) }); status.textContent = 'Completed focus test: ' + JSON.stringify(result);
  })().catch(async error => { status.textContent = String(error); await fetch('/capture/' + encodeURIComponent(job + '-failure'), { method: 'POST', body: JSON.stringify({ error: String(error) }) }); });
});
void ready().catch(error => { status.textContent = String(error); });
