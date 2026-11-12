import { distribution } from './statistics.ts';
const job = new URL(location.href).searchParams.get('job')!;
const frames: number[] = [], trips: number[] = [];
const Native = Worker;
globalThis.Worker = class extends Native {
  private readonly pending = new Map<number, number>();
  constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.addEventListener('message', event => { const id = (event.data as { id?: number }).id, start = id === undefined ? undefined : this.pending.get(id); if (start !== undefined) { trips.push(performance.now() - start); this.pending.delete(id!); } }); }
  public override postMessage(message: unknown, transfers: Transferable[] | StructuredSerializeOptions = []): void { const id = (message as { id?: number }).id; if (id !== undefined) this.pending.set(id, performance.now()); if (Array.isArray(transfers)) super.postMessage(message, transfers); else super.postMessage(message, transfers); }
};
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const status = document.createElement('output'); status.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99999;background:#142025;color:white;padding:8px;pointer-events:none'; document.body.append(status);
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(value => value.textContent?.trim() === label && !value.disabled && !value.closest('[inert]')); }
async function run() {
  const deadline = performance.now() + 45000; while (!button('New Game')) { if (performance.now() > deadline) throw new Error('No New Game'); await wait(100); }
  button('New Game')!.click(); while (!document.querySelector('[data-objective-title]')) await wait(100);
  const canvas = document.querySelector('canvas')!; canvas.focus(); canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await wait(15000); globalThis.__scrapworksPhysicsProbe?.drain(); trips.length = 0;
  let previous = performance.now(), lastDrain = previous; const start = previous;
  await new Promise<void>(resolve => { function frame(now: number) { frames.push(now - previous); previous = now; if (now - lastDrain > 500) { globalThis.__scrapworksPhysicsProbe?.drain(); lastDrain = now; } status.textContent = `${job}: ${Math.floor((now - start) / 1000)}/90 seconds`; if (now - start < 90000) requestAnimationFrame(frame); else resolve(); } requestAnimationFrame(frame); });
  await fetch('/capture/' + encodeURIComponent(job), { method: 'POST', body: JSON.stringify({ job, instrumented: !!globalThis.__scrapworksPhysicsProbe, frames: distribution(frames), roundTrip: distribution(trips), rawFramesMs: frames, rawRoundTripMs: trips, hidden: document.hidden, focused: document.hasFocus(), viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, limitation: 'RAF cadence control, not submitted-frame latency. Lightweight wrapper is identical in both arms; capture uses fixed idle world. Trace receipt serialization in primary acquisition adds separate host work.' }) });
  const next = await (await fetch('/next?completed=' + encodeURIComponent(job))).json() as { url?: string }; if (next.url) location.href = next.url; else status.textContent = 'Overhead controls completed';
}
void run().catch(async error => { status.textContent = String(error); await fetch('/capture/' + encodeURIComponent(job + '-failure'), { method: 'POST', body: JSON.stringify({ error: String(error) }) }); });
