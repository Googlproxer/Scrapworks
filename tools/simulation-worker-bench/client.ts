import { Runtime } from './runtime.ts';
import { assert, epoch } from './protocol.ts';
import type { Capture, Frame, Options, Reply, Request } from './protocol.ts';
import type { RecordData } from '../ecs-bench/model.ts';

let generation = 0;
export class Client {
  public generation = ++generation;
  public revision = 0;
  public version = 0;
  public tick = 0;
  public completed = 0;
  public records: (RecordData | undefined)[] = [];
  public latest?: Reply;
  public pendingCount = 0;
  public maxPending = 0;
  public hostApplyMs = 0;
  public receiveDataMs = 0;
  public receiverMs = 0;
  public decodeMs = 0;
  public receiveEpoch = 0;
  public timeoutMs = 15000;
  private serial = 0;
  private runtime?: Runtime;
  private worker?: Worker;
  private disposed = false;
  private pending = new Map<
    number,
    {
      resolve: (reply: Reply) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  public constructor(public readonly options: Options) {
    if (options.execution === 'inline') this.runtime = new Runtime();
    else {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: `simulation-${options.candidate}`,
      });
      this.worker.onmessage = (event: MessageEvent<Reply>) => {
        const receiveStart = performance.now();
        const reply = event.data;
        this.receiveDataMs = performance.now() - receiveStart;
        if (reply.generation !== this.generation || this.disposed) return;
        const request = this.pending.get(reply.id);
        if (!request) return;
        this.pending.delete(reply.id);
        clearTimeout(request.timeout);
        this.pendingCount = this.pending.size;
        try {
          request.resolve(this.consume(reply));
        } catch (error) {
          request.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          this.receiverMs = performance.now() - receiveStart;
        }
      };
      this.worker.onerror = (event) => this.fail(new Error(event.message || 'Worker error'));
      this.worker.onmessageerror = () =>
        this.fail(new Error('Worker message could not be decoded'));
    }
  }
  private fail(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
    this.pendingCount = 0;
  }
  public apply(frame: Frame): void {
    if (frame.version <= this.version) return;
    assert(frame.base === this.version, 'Publication gap: full resynchronization required');
    for (const id of frame.view.removed) {
      const ordinal = Number(id.split('-')[1]);
      if (this.records[ordinal]?.payload.id === id) this.records[ordinal] = undefined;
    }
    for (const record of frame.view.records) this.records[record.payload.ordinal] = record;
    this.version = frame.version;
    this.tick = frame.view.tick;
    this.completed = frame.view.completed;
  }
  private consume(reply: Reply): Reply {
    this.receiveEpoch = epoch();
    assert(reply.protocol === 1 && reply.generation === this.generation, 'Invalid reply envelope');
    if (!reply.ok) throw new Error(reply.error ?? 'Worker failure');
    const begin = performance.now();
    if (reply.packed) {
      reply.frame = JSON.parse(new TextDecoder().decode(reply.packed)) as Frame;
      reply.packed = undefined;
    }
    this.decodeMs = performance.now() - begin;
    const start = performance.now();
    // A completed pre-pause publication remains valid world state. Discarding its
    // version would create a gap; input invalidation is enforced by the coordinator.
    if (reply.frame) this.apply(reply.frame);
    this.hostApplyMs = performance.now() - start + this.decodeMs;
    this.latest = reply;
    return reply;
  }
  public request(
    operation: Request['operation'],
    fields: Partial<Request> = {},
  ): Reply | Promise<Reply> {
    assert(!this.disposed, 'Disposed client');
    const request: Request = {
      ...fields,
      protocol: 1,
      generation: this.generation,
      revision: this.revision,
      id: ++this.serial,
      operation,
      sentEpoch: epoch(),
    };
    if (this.runtime) {
      this.receiveDataMs = 0;
      const reply = this.runtime.handle(request);
      if (reply instanceof Promise)
        return reply.then((result) => {
          const consumed = this.consume(result);
          this.receiverMs = this.hostApplyMs;
          return consumed;
        });
      const consumed = this.consume(reply);
      this.receiverMs = this.hostApplyMs;
      return consumed;
    }
    assert(this.pending.size < 8, 'Host request backpressure');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.fail(new Error(`Worker timeout after ${this.timeoutMs}ms`));
        this.worker?.terminate();
        this.worker = undefined;
      }, this.timeoutMs);
      this.pending.set(request.id, { resolve, reject, timeout });
      this.pendingCount = this.pending.size;
      this.maxPending = Math.max(this.maxPending, this.pendingCount);
      try {
        this.worker!.postMessage(request);
      } catch (error) {
        this.fail(new Error(String(error)));
      }
    });
  }
  public initialize(capture?: Capture): Reply | Promise<Reply> {
    this.fail(new Error('World replaced'));
    this.generation = ++generation;
    this.version = 0;
    this.records = [];
    this.tick = 0;
    this.latest = undefined;
    return this.request('initialize', { options: this.options, capture });
  }
  public pause(): Reply | Promise<Reply> {
    this.revision++;
    return this.request('pause');
  }
  public resume(): Reply | Promise<Reply> {
    this.revision++;
    return this.request('resume');
  }
  public release(): void {
    this.latest = undefined;
  }
  public async disposeWorldForProfile(): Promise<void> {
    await this.request('dispose');
    this.records = [];
    this.latest = undefined;
  }
  public async dispose(): Promise<void> {
    if (this.disposed) return;
    try {
      if (this.worker || this.runtime) await this.request('dispose');
    } finally {
      this.disposed = true;
      this.worker?.terminate();
      this.worker = undefined;
      this.runtime = undefined;
      this.fail(new Error('Disposed client'));
      this.records = [];
      this.latest = undefined;
    }
  }
  /** Fault/lifecycle diagnostic: unexpected termination must settle every request. */
  public crash(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.runtime = undefined;
    this.fail(new Error('Worker terminated'));
  }
}
