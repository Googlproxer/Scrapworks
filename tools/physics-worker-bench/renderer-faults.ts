/** A separate validation control; normal acquisitions never install this wrapper. */
export function installRendererFault(kind: string): void {
  if (!kind || kind === 'none') return;
  const Native = Worker;
  let created = 0;
  globalThis.Worker = class extends Native {
    private target: number | undefined;
    private injected = false;
    private readonly replayed = new WeakSet<Event>();
    constructor(url: string | URL, options?: WorkerOptions) {
      super(kind === 'init-once' && created++ === 0 ? '/injected-worker-failure.js' : url, options);
      if (kind === 'init-once') return;
      this.addEventListener('message', event => {
        if (this.replayed.has(event) || this.injected || (event.data as { id?: number }).id !== this.target) return;
        this.injected = true;
        event.stopImmediatePropagation();
        const received = performance.now();
        globalThis.__scrapworksPhysicsProbe?.mark('injected-original-result', { kind, id: this.target, received, diagnostics: event.data.physicsProbe });
        const replay = () => {
          const data = kind === 'stale' ? { ...event.data, generation: event.data.generation - 1 } : event.data;
          const value = new MessageEvent('message', { data }); this.replayed.add(value);
          globalThis.__scrapworksPhysicsProbe?.mark('injected-result', { kind, waitedMs: performance.now() - received, id: this.target });
          this.dispatchEvent(value);
        };
        if (kind === 'drop') { globalThis.__scrapworksPhysicsProbe?.mark('injected-result', { kind, id: this.target }); return; }
        if (kind === 'delay-50') setTimeout(replay, 50);
        else if (kind === 'frame') requestAnimationFrame(() => requestAnimationFrame(replay));
        else replay();
      }, { capture: true });
    }
    public override postMessage(message: unknown, transfers: Transferable[] | StructuredSerializeOptions = []): void {
      const request = message as { id: number; operation: string; input?: { x: number; z: number } };
      if (this.target === undefined && request.operation === 'advance' && request.input && Math.hypot(request.input.x, request.input.z) > .01 && globalThis.__scrapworksExperimentInput?.probeId === 1) this.target = request.id;
      if (Array.isArray(transfers)) super.postMessage(message, transfers); else super.postMessage(message, transfers);
    }
  };
}
