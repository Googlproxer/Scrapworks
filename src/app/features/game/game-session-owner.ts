import { signal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import type { WorldDefinition, WorldView } from '@contracts/world';
import type { SessionEvent } from '@contracts/session-event';
import type { SaveSnapshot } from '@contracts/save';
import type { SimulationPort, SimulationPortFactory } from '../../../session/port';
import { GameSession } from '../../../session/game-session';

/** Sole application owner of a world, independent of renderer replacement. */
export class GameSessionOwner {
  private session?: GameSession;
  private definitionValue?: WorldDefinition;
  private revision = 0;
  private events = new Subscription();
  private idlePort?: { readonly port: SimulationPort; stop: () => void };
  private destroyed = false;
  private readonly warmStateValue = signal<'idle' | 'loading' | 'ready' | 'failed' | 'claimed'>(
    'idle',
  );
  public readonly warmState = this.warmStateValue.asReadonly();
  private readonly eventSource = new Subject<SessionEvent>();
  private readonly failureSource = new Subject<Error>();
  private readonly worldValue = signal<WorldView | null>(null);
  private readonly runValue = signal<string | null>(null);
  public readonly runId = this.runValue.asReadonly();
  public readonly events$ = this.eventSource.asObservable();
  public readonly failures$ = this.failureSource.asObservable();
  public readonly world = this.worldValue.asReadonly();

  public constructor(
    private readonly createPort: SimulationPortFactory,
    private readonly developer: boolean,
  ) {}

  public get current(): GameSession | undefined {
    return this.session;
  }

  public get definition(): WorldDefinition | undefined {
    return this.definitionValue;
  }

  public prewarm(): void {
    if (this.destroyed || this.session || this.idlePort) return;
    this.warmStateValue.set('loading');
    try {
      const port = this.createPort();
      const entry = { port, stop: () => undefined as void };
      this.idlePort = entry;

      const failed = () => {
        if (this.idlePort !== entry) return;
        this.idlePort = undefined;
        entry.stop();
        port.dispose();
        this.warmStateValue.set('failed');
      };

      entry.stop = port.subscribeFailure?.(failed) ?? entry.stop;
      void Promise.resolve(port.warmup?.()).then(() => {
        if (this.idlePort === entry) this.warmStateValue.set('ready');
      }, failed);
    } catch {
      const entry = this.idlePort;
      this.idlePort = undefined;
      entry?.stop();
      entry?.port.dispose();
      this.warmStateValue.set('failed');
    }
  }

  private acquirePort(purpose: 'activation' | 'validation'): SimulationPort {
    const entry = purpose === 'activation' ? this.idlePort : undefined;
    if (!entry) return this.createPort();
    this.idlePort = undefined;
    entry.stop();
    this.warmStateValue.set('claimed');
    return entry.port;
  }

  public initialize(definition: WorldDefinition): Promise<void> {
    if (!this.session || this.session.failed || this.definitionValue?.id !== definition.id) {
      this.disposeWorld();
      this.definitionValue = definition;
      const revision = ++this.revision;
      this.session = new GameSession(definition, {
        developerFixture: this.developer,
        freezeViews: this.developer,
        portFactory: () => this.acquirePort('activation'),
        onFailure: (error) => {
          if (revision === this.revision) this.failureSource.next(error);
        },
      });
      this.runValue.set(crypto.randomUUID());
      this.events = new Subscription();
      this.events.add(
        this.session.events$.subscribe((event) => {
          if (revision === this.revision) this.eventSource.next(event);
        }),
      );
    }
    this.session.clearInput();
    this.session.resetTiming();
    return this.session.ready;
  }

  public pin(view: WorldView): WorldView {
    this.worldValue.set(view);
    return view;
  }

  public async prepare(
    definition: WorldDefinition,
    save: SaveSnapshot | null,
    purpose: 'activation' | 'validation' = 'activation',
  ): Promise<GameSession> {
    const candidate = new GameSession(definition, {
      portFactory: () => this.acquirePort(purpose),
      developerFixture: this.developer,
      freezeViews: this.developer,
      playerSave: !!save,
      capture: save
        ? {
            world: save.world,
            ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
            pending: [],
          }
        : undefined,
      onFailure: (error) => {
        if (this.session?.error === error) this.failureSource.next(error);
      },
    });
    try {
      await candidate.ready;
      return candidate;
    } catch (error) {
      candidate.dispose();
      throw error;
    }
  }

  public commit(candidate: GameSession, runId: string): void {
    if (!candidate.isReady) throw new Error('Restored simulation is not ready.');
    const previous = this.session;
    ++this.revision;
    this.events.unsubscribe();
    this.events = new Subscription();
    this.session = candidate;
    this.definitionValue = candidate.definition;
    this.runValue.set(runId);
    this.events.add(
      candidate.events$.subscribe((event) => {
        if (this.session === candidate) this.eventSource.next(event);
      }),
    );
    this.pin(candidate.readView());
    previous?.dispose();
  }

  public disposeWorld(): void {
    ++this.revision;
    this.events.unsubscribe();
    this.session?.dispose();
    this.session = undefined;
    this.definitionValue = undefined;
    this.worldValue.set(null);
    this.runValue.set(null);
  }

  public destroy(): void {
    this.destroyed = true;
    const idle = this.idlePort;
    this.idlePort = undefined;
    idle?.stop();
    idle?.port.dispose();
    this.disposeWorld();
    this.eventSource.complete();
    this.failureSource.complete();
  }
}
