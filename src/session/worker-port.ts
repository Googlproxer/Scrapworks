import type { RuntimeReply, RuntimeRequest } from '@contracts/simulation';
import type { SimulationPort } from './port';
import { fromEvent, ReplaySubject, Subscription } from 'rxjs';
import {
  isBootstrapMessage,
  isBootstrapVersion,
  SIMULATION_WARMUP,
} from '../contracts/worker-bootstrap';

export class WorkerSimulationPort implements SimulationPort {
  private worker?: Worker;
  private failure?: Error;
  private readonly subscriptions = new Subscription();
  private readonly failures = new ReplaySubject<Error>(1);
  private readonly pending = new Map<
    number,
    {
      resolve: (reply: RuntimeReply) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  public timeoutMs = 15000;
  private bootstrap?: {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
  };

  constructor(
    worker = new Worker(new URL('../workers/simulation.worker', import.meta.url), {
      type: 'module',
      name: 'scrapworks-simulation',
    }),
    observeReceipt?: (milliseconds: number) => void,
  ) {
    this.worker = worker;
    this.subscriptions.add(
      fromEvent<MessageEvent<RuntimeReply>>(worker, 'message').subscribe((event) => {
        if (isBootstrapMessage(event.data, 'simulation-ready')) {
          if (!isBootstrapVersion(event.data)) {
            this.fail(new Error('Invalid simulation bootstrap version'));
            return;
          }
          if (this.bootstrap) {
            clearTimeout(this.bootstrap.timer);
            this.bootstrap.resolve();
          }
          return;
        }
        const begin = observeReceipt ? performance.now() : 0;
        const reply = event.data;
        const pending = this.pending.get(reply.id);
        if (!pending) return;
        this.pending.delete(reply.id);
        clearTimeout(pending.timer);
        pending.resolve(reply);
        observeReceipt?.(performance.now() - begin);
      }),
    );
    this.subscriptions.add(
      fromEvent<ErrorEvent>(worker, 'error').subscribe((event) => {
        event.preventDefault();
        this.fail(new Error(event.message || 'Simulation worker failed'));
      }),
    );
    this.subscriptions.add(
      fromEvent(worker, 'messageerror').subscribe(() =>
        this.fail(new Error('Simulation worker reply could not be decoded')),
      ),
    );
  }

  public warmup(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.bootstrap) return this.bootstrap.promise;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const timer = setTimeout(
      () => this.fail(new Error('Simulation bootstrap timed out')),
      this.timeoutMs,
    );
    this.bootstrap = { promise, resolve, reject, timer };
    void promise.catch(() => undefined);
    try {
      this.worker!.postMessage(SIMULATION_WARMUP);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
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
    const subscription = this.failures.subscribe(listener);
    return () => subscription.unsubscribe();
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    if (this.bootstrap) {
      clearTimeout(this.bootstrap.timer);
      this.bootstrap.reject(error);
    }
    this.subscriptions.unsubscribe();
    this.worker?.terminate();
    this.worker = undefined;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.failures.next(error);
    this.failures.complete();
  }

  public dispose(): void {
    this.fail(new Error('Simulation worker disposed'));
  }
}
