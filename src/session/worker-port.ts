import type { RuntimeReply, RuntimeRequest } from '@contracts/simulation';
import type { SimulationPort } from './port';

export class WorkerSimulationPort implements SimulationPort {
  private worker?: Worker;
  private failure?: Error;
  private readonly failureListeners = new Set<(error: Error) => void>();
  private readonly pending = new Map<
    number,
    {
      resolve: (reply: RuntimeReply) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  public timeoutMs = 15000;
  constructor(
    worker = new Worker(new URL('../workers/simulation.worker', import.meta.url), {
      type: 'module',
      name: 'scrapworks-simulation',
    }),
    observeReceipt?: (milliseconds: number) => void,
  ) {
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<RuntimeReply>) => {
      const begin = observeReceipt ? performance.now() : 0;
      const reply = event.data;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      clearTimeout(pending.timer);
      pending.resolve(reply);
      observeReceipt?.(performance.now() - begin);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || 'Simulation worker failed'));
    };
    worker.onmessageerror = () =>
      this.fail(new Error('Simulation worker reply could not be decoded'));
  }
  public send(request: RuntimeRequest): Promise<RuntimeReply> {
    if (!this.worker) return Promise.reject(new Error('Disposed simulation worker'));
    if (this.pending.size >= 8) return Promise.reject(new Error('Worker request backpressure'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error('Simulation worker timed out')),
        this.timeoutMs,
      );
      this.pending.set(request.id, { resolve, reject, timer });
      try {
        this.worker!.postMessage(request);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  public subscribeFailure(listener: (error: Error) => void): () => void {
    if (this.failure) listener(this.failure);
    else this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }
  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.worker?.terminate();
    this.worker = undefined;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    const listeners = [...this.failureListeners];
    this.failureListeners.clear();
    for (const listener of listeners) listener(error);
  }
  public dispose(): void {
    this.fail(new Error('Simulation worker disposed'));
  }
}
