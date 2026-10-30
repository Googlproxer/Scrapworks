import type { GameTickContext, GameTickHandler } from '@contracts/game-tick';
import type {
  CommandAcknowledgement,
  Inspection,
  RuntimeReply,
  RuntimeRequest,
  SequencedCommand,
  SimulationCapture,
} from '@contracts/simulation';
import {
  MAX_DETAIL_SUBSCRIPTIONS,
  MAX_PENDING_COMMANDS,
  requireInvariant as check,
} from '@contracts/simulation';
import type { WorldCommand, WorldDefinition, WorldView } from '@contracts/world';
import type { SimulationPort, SimulationPortFactory } from './port';
import { WorkerSimulationPort } from './worker-port';
import { PresentationCache, PublicationGapError } from './presentation-cache';

export interface SessionOptions {
  developerFixture?: boolean;
  portFactory?: SimulationPortFactory;
  capture?: SimulationCapture;
  onFailure?: (error: Error) => void;
}
interface Registration {
  handler: GameTickHandler;
  order: number;
  serial: number;
  after: number;
  active: boolean;
}
let nextGeneration = 0;
/** Application coordinator; the production graph imports no simulation implementation. */
export class GameSession {
  public readonly ready: Promise<void>;
  public readonly generation = ++nextGeneration;
  public readonly cache = new PresentationCache();
  public readonly acknowledgements: CommandAcknowledgement[] = [];
  public maxPendingSteps = 0;
  public droppedSeconds = 0;
  public appliedInput = 0;
  private readonly port: SimulationPort;
  private readonly unsubscribeFailure?: () => void;
  private requestSerial = 0;
  private revision = 0;
  private nextCommand = 0;
  private commands: SequencedCommand[] = [];
  private movement = { x: 0, z: 0, sprint: false };
  private inputSerial = 0;
  private elapsed = 0;
  private outstanding = 0;
  private advancing?: Promise<void>;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly registrations = new Set<Registration>();
  private readonly detailListeners = new Map<string, Set<(value: Inspection | null) => void>>();
  private watching = false;
  private watchDirty = false;
  private notifications: number[] = [];
  private draining = false;
  private handlerSerial = 0;
  private paused = false;
  private disposed = false;
  private capturing = false;
  private captureCommands: SequencedCommand[] = [];
  private failure?: Error;
  private initialized = false;
  private resynchronizing?: Promise<void>;
  public readonly definition: WorldDefinition;
  private readonly options: SessionOptions;
  constructor(definition: WorldDefinition, options: SessionOptions = {}) {
    this.definition = definition;
    this.options = { developerFixture: options.developerFixture, onFailure: options.onFailure };
    this.port = (options.portFactory ?? (() => new WorkerSimulationPort()))();
    this.unsubscribeFailure = this.port.subscribeFailure?.((error) => this.fail(error));
    try {
      const result = this.request('initialize', {
        definition,
        developerFixture: options.developerFixture,
        capture: options.capture,
      });
      this.ready = Promise.resolve(result).then(
        () => {
          this.initialized = true;
          this.updateWatch();
        },
        (error: unknown) => {
          this.fail(error);
          throw error;
        },
      );
      // Inline controls are immediately usable, without a Promise on their tick path.
      if (!(result instanceof Promise)) this.initialized = true;
    } catch (error) {
      this.fail(error);
      this.ready = Promise.reject(this.failure);
    }
    void this.ready.catch(() => undefined);
  }
  public get failed(): boolean {
    return !!this.failure;
  }
  public get error(): Error | undefined {
    return this.failure;
  }
  public get isReady(): boolean {
    return this.initialized && !this.failed && !this.disposed;
  }
  public get pendingSteps(): number {
    return this.outstanding;
  }
  public get activityRevision(): number {
    return this.revision;
  }
  public get submittedInput(): number {
    return this.inputSerial;
  }
  public get view(): WorldView {
    const view: { -readonly [K in keyof WorldView]: WorldView[K] } = structuredClone(
      this.readView(),
    );
    delete view.publication;
    delete view.worldGeneration;
    delete view.changes;
    delete view.endpoints;
    return view;
  }
  public get current(): WorldView {
    return this.view;
  }
  public readView(): WorldView {
    return this.cache.read();
  }
  private consume(reply: RuntimeReply): RuntimeReply {
    check(
      !this.disposed && reply.protocol === 1 && reply.generation === this.generation,
      'Stale/disposed session reply',
    );
    check(reply.ok, reply.error ?? 'Simulation failed');
    this.nextCommand = Math.max(this.nextCommand, reply.ledger.accepted);
    this.appliedInput = reply.appliedInput;
    for (const ack of reply.acknowledgements) {
      this.acknowledgements.push(ack);
      if (this.acknowledgements.length > MAX_PENDING_COMMANDS) this.acknowledgements.shift();
    }
    if (reply.packet) {
      try {
        this.cache.apply(reply.packet, this.generation);
      } catch (error) {
        if (!(error instanceof PublicationGapError) || this.resynchronizing) throw error;
        // A missing delta requests one bounded full publication. Do not deliver
        // summaries against a stale base or submit more credits until it arrives.
        this.notifications = [];
        this.resynchronizing = Promise.resolve()
          .then(async () => {
            await this.request('resync');
          })
          .catch((cause: unknown) => this.fail(cause))
          .finally(() => {
            this.resynchronizing = undefined;
          });
        return reply;
      }
    }
    if (reply.watch) this.cache.replaceDetails(reply.watch, reply.details ?? []);
    if (reply.revision === this.revision && !this.paused) {
      check(
        this.notifications.length + reply.completedTicks.length <= 5,
        'Unbounded completion queue',
      );
      this.notifications.push(...reply.completedTicks);
    }
    if (reply.packet || reply.watch)
      for (const [id, listeners] of this.detailListeners) {
        const value = this.cache.details.get(id) ?? null;
        for (const listener of listeners) listener(value ? structuredClone(value) : null);
      }
    return reply;
  }
  private request(
    operation: RuntimeRequest['operation'],
    fields: Partial<RuntimeRequest> = {},
  ): RuntimeReply | Promise<RuntimeReply> {
    check(!this.disposed, 'Disposed session');
    const request: RuntimeRequest = {
      ...fields,
      protocol: 1,
      id: ++this.requestSerial,
      generation: this.generation,
      revision: this.revision,
      operation,
    };
    const value = this.port.send(request);
    if (!(value instanceof Promise)) return this.consume(value);
    const pending = value.then((reply) => this.consume(reply));
    this.pending.add(pending);
    void pending.then(
      () => this.pending.delete(pending),
      () => this.pending.delete(pending),
    );
    return pending;
  }
  private fail(cause: unknown): void {
    if (this.failure || this.disposed) return;
    this.failure = cause instanceof Error ? cause : new Error(String(cause));
    this.elapsed = 0;
    this.outstanding = 0;
    this.commands = [];
    this.captureCommands = [];
    this.notifications = [];
    this.port.dispose();
    this.options.onFailure?.(this.failure);
  }
  public registerCompletedTickHandler(handler: GameTickHandler, order = 0): () => void {
    check(Number.isFinite(order), 'Game tick order must be finite.');
    const registration: Registration = {
      handler,
      order,
      serial: this.handlerSerial++,
      after: this.cache.version ? this.readView().tick : 0,
      active: true,
    };
    this.registrations.add(registration);
    return () => {
      registration.active = false;
      this.registrations.delete(registration);
    };
  }
  public flushCompleted(): void {
    if (this.paused || this.disposed || this.failed) {
      this.notifications = [];
      return;
    }
    check(!this.draining, 'A presentation notification cannot recursively drain its session.');
    const revision = this.revision;
    const ticks = this.notifications;
    this.notifications = [];
    this.draining = true;
    try {
      for (const tick of ticks) {
        const view = this.readView();
        const context: GameTickContext = Object.freeze({
          tick,
          deltaSeconds: 0.05,
          phase: 'completed',
          generation: this.generation,
          publishedTick: view.tick,
          publication: this.cache.version,
        });
        for (const r of [...this.registrations].sort(
          (a, b) => a.order - b.order || a.serial - b.serial,
        )) {
          if (r.active && tick > r.after) r.handler(context);
          if (this.disposed || this.paused || revision !== this.revision) return;
        }
      }
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.draining = false;
    }
  }
  public advance(seconds: number): void {
    if (
      this.paused ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      !this.initialized ||
      this.disposed
    )
      return;
    if (this.failure) throw this.failure;
    check(!this.draining, 'A completed tick cannot recursively advance its session.');
    const limit = Math.max(0, 0.25 - this.outstanding * 0.05);
    this.droppedSeconds += Math.max(0, this.elapsed + seconds - limit);
    this.elapsed = Math.min(limit, this.elapsed + seconds);
    this.maxPendingSteps = Math.max(this.maxPendingSteps, this.elapsed / 0.05 + this.outstanding);
    if (this.advancing || this.capturing || this.resynchronizing) return;
    const steps = Math.min(5, Math.floor((this.elapsed + 1e-10) / 0.05));
    if (!steps) return;
    this.elapsed = Math.max(0, this.elapsed - steps * 0.05);
    this.outstanding = steps;
    const commands = this.commands;
    this.commands = [];
    try {
      const reply = this.request('advance', {
        steps,
        input: this.movement,
        inputSequence: ++this.inputSerial,
        commands,
      });
      if (reply instanceof Promise)
        this.advancing = reply
          .then(() => undefined)
          .catch((error: unknown) => this.fail(error))
          .finally(() => {
            this.outstanding = 0;
            this.advancing = undefined;
          });
      else this.outstanding = 0;
    } catch (error) {
      this.outstanding = 0;
      this.fail(error);
      throw error;
    }
  }
  public setMovement(direction: { readonly x: number; readonly z: number }, sprint = false): void {
    if (this.paused || this.failed || this.disposed) return;
    this.movement = {
      x: Number.isFinite(direction.x) ? direction.x : 0,
      z: Number.isFinite(direction.z) ? direction.z : 0,
      sprint,
    };
  }
  private activity(): void {
    this.revision++;
    this.elapsed = 0;
    this.notifications = [];
    this.movement = { x: 0, z: 0, sprint: false };
    const commands = [...this.captureCommands, ...this.commands];
    this.captureCommands = [];
    this.commands = [];
    if (this.failed || this.disposed) return;
    try {
      const result = this.request('activity', { active: !this.paused, commands });
      if (result instanceof Promise) void result.catch((error: unknown) => this.fail(error));
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }
  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.activity();
  }
  public pause(paused = true): void {
    this.setPaused(paused);
  }
  public clearInput(): void {
    this.activity();
  }
  public resetTiming(): void {
    this.activity();
  }
  public enqueue(command: WorldCommand): number | null {
    if (this.paused || this.failed || this.disposed) return null;
    check(this.commands.length < MAX_PENDING_COMMANDS, 'Host command backpressure');
    const sequence = ++this.nextCommand;
    this.commands.push({ sequence, command: structuredClone(command) });
    return sequence;
  }
  public async settled(): Promise<void> {
    await this.ready;
    while (this.pending.size || this.advancing || this.resynchronizing)
      await Promise.all([
        ...this.pending,
        ...(this.advancing ? [this.advancing] : []),
        ...(this.resynchronizing ? [this.resynchronizing] : []),
      ]);
  }
  public async capture(): Promise<SimulationCapture> {
    check(!this.capturing && !this.failed, 'Capture unavailable');
    this.capturing = true;
    // Commands arriving after this boundary remain in the host queue.
    this.captureCommands = this.commands;
    this.commands = [];
    try {
      await this.settled();
      const commands = this.captureCommands;
      this.captureCommands = [];
      if (commands.length) await this.request('advance', { steps: 0, commands });
      const reply = await this.request('capture');
      check(reply.capture, 'Missing capture');
      return reply.capture;
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.capturing = false;
    }
  }
  public async resynchronize(): Promise<void> {
    await this.settled();
    await this.request('resync');
    this.notifications = [];
  }
  public async inspect(id: string): Promise<Inspection | null> {
    await this.ready;
    const reply = await this.request('inspect', { watch: [id] });
    return reply.details?.find((d) => d.id === id) ?? null;
  }
  public subscribeDetails(id: string, listener: (value: Inspection | null) => void): () => void {
    const listeners = this.detailListeners.get(id) ?? new Set();
    check(
      this.detailListeners.has(id) ||
        this.detailListeners.size + (this.detailListeners.has(this.cache.playerId) ? 0 : 1) <
          MAX_DETAIL_SUBSCRIPTIONS,
      'Detail subscription limit',
    );
    listeners.add(listener);
    this.detailListeners.set(id, listeners);
    this.watchDirty = true;
    this.updateWatch();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.detailListeners.delete(id);
      this.watchDirty = true;
      this.updateWatch();
    };
  }
  private updateWatch(): void {
    if (this.watching || !this.watchDirty || !this.initialized || this.disposed || this.failed)
      return;
    this.watching = true;
    this.watchDirty = false;
    const watch = [...new Set([this.cache.playerId, ...this.detailListeners.keys()])];
    const finish = (): void => {
      this.watching = false;
      if (this.watchDirty) queueMicrotask(() => this.updateWatch());
    };
    try {
      const r = this.request('watch', { watch });
      if (r instanceof Promise)
        void r.then(finish, (error: unknown) => {
          finish();
          this.fail(error);
        });
      else finish();
    } catch (error) {
      finish();
      this.fail(error);
    }
  }
  public async disposeWorldForProfile(): Promise<void> {
    await this.settled();
    await this.request('dispose');
    this.cache.dispose();
    this.registrations.clear();
    this.detailListeners.clear();
    this.notifications = [];
    this.commands = [];
    this.captureCommands = [];
    this.initialized = false;
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeFailure?.();
    this.port.dispose();
    this.cache.dispose();
    this.registrations.clear();
    this.detailListeners.clear();
    this.notifications = [];
    this.commands = [];
    this.captureCommands = [];
    this.elapsed = this.outstanding = 0;
  }
}
