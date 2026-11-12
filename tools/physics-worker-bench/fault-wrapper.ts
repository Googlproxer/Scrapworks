const parameters = new URL(location.href).searchParams;
const target = parameters.get('target')!;
const kind = parameters.get('kind') ?? 'track';
const delay = Number(parameters.get('ms') ?? 0);
const variant = parameters.get('variant');
const nativePost = postMessage.bind(globalThis);
const NativeWorker = Worker;
const queued: MessageEvent<unknown>[] = [];
const buffer = (event: MessageEvent<unknown>) => { event.stopImmediatePropagation(); queued.push(event); };
addEventListener('message', buffer);
let children = 0;
function dispatch(message: unknown, send: (message: unknown) => void, terminate: () => void): void {
  const reply = message as { id?: number; operation?: string; generation?: number; tick?: number; position?: { x: number }; packet?: { rows: ArrayBuffer } };
  const selected = variant === 'C1' ? reply.id === 2 : reply.operation === 'advance';
  if (!selected || kind === 'track') { send(message); return; }
  if (kind === 'drop') return;
  if (kind === 'terminate') { terminate(); return; }
  if (kind === 'delay') { setTimeout(() => send(message), delay); return; }
  if (kind === 'stale') { send({ ...reply, generation: (reply.generation ?? 0) - 1 }); return; }
  if (kind === 'reorder') { send({ ...reply, id: (reply.id ?? 0) + 1 }); return; }
  if (kind === 'corrupt') {
    if (variant === 'C1') send({ ...reply, position: { x: NaN, y: 0, z: 0 } });
    else { if (reply.packet) new Float64Array(reply.packet.rows)[2] = NaN; send(message); }
    return;
  }
  if (kind === 'detached' && reply.packet) { structuredClone(reply.packet.rows, { transfer: [reply.packet.rows] }); send(message); return; }
  if (kind === 'reuse') {
    send(message);
    if (reply.packet) new Float64Array(reply.packet.rows).fill(NaN);
    if (reply.position) reply.position.x = NaN;
    send(message); return;
  }
  send(message);
  if (kind === 'duplicate') send(structuredClone(message));
}

globalThis.Worker = class extends NativeWorker {
  private readonly child = ++children;
  constructor(url: string | URL, options?: WorkerOptions) {
    super(kind === 'init-fail' ? '/missing-physics-worker.js' : url, options);
    nativePost({ __child: 'created', childId: this.child });
  }
  public override postMessage(message: unknown, transfers: Transferable[] | StructuredSerializeOptions = []): void {
    const data = message as { port?: MessagePort };
    if (variant !== 'C1' || kind === 'track' || !data?.port) {
      if (Array.isArray(transfers)) super.postMessage(message, transfers); else super.postMessage(message, transfers);
      return;
    }
    const source = data.port, bridge = new MessageChannel();
    source.addEventListener('message', event => bridge.port1.postMessage(event.data));
    bridge.port1.addEventListener('message', event => dispatch(event.data, value => source.postMessage(value), () => this.terminate()));
    source.start(); bridge.port1.start();
    super.postMessage({ ...data, port: bridge.port2 }, [bridge.port2]);
  }
  public override terminate(): void { nativePost({ __child: 'disposed', childId: this.child }); super.terminate(); }
};
if (variant !== 'C1' && kind !== 'track') {
  if (kind === 'init-fail') throw new Error('Injected worker initialization failure');
  globalThis.postMessage = ((message: unknown) => dispatch(message, value => nativePost(value), () => close())) as typeof postMessage;
}
await import(target);
removeEventListener('message', buffer);
for (const event of queued) dispatchEvent(new MessageEvent('message', { data: event.data, ports: [...event.ports] }));
export {};
