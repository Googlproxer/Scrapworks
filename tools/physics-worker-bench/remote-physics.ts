// This file is copied into the isolated C1 project; imports are rewritten there by variants.ts.
import type {
  PhysicsBodyDefinition,
  PhysicsSnapshot,
  WorldRotation,
} from '../../src/contracts/physics.ts';
import type { WorldDefinition, WorldPosition } from '../../src/contracts/world.ts';
import type { NamedCollider } from '../../src/simulation/physics/world-physics.ts';
import type {
  ColliderDelta,
  Motion,
  PhysicsRequest,
  PhysicsReply,
  BodyPose,
} from './physics-protocol.ts';
import { requireMatchingReply } from './physics-protocol.ts';
import { fromEvent, Subscription } from 'rxjs';

/** Native Rapier state exists only in the paired physics worker. This object contains deltas and resolved poses. */
export class RemotePhysics {
  private readonly statics = new Map<string, NamedCollider>();
  private readonly bodies = new Map<string, PhysicsBodyDefinition>();
  private readonly signatures = {
    static: new Map<string, string>(),
    bodies: new Map<string, string>(),
  };
  private deltas: ColliderDelta[] = [];
  private revision = 0;
  private tick: number;
  private serial = 0;
  private disposed = false;
  private started = false;
  private worker?: Worker;
  private port?: MessagePort;
  private readonly subscriptions = new Subscription();
  private failure?: Error;
  private pending?: {
    request: PhysicsRequest;
    resolve: (reply: PhysicsReply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private poses: BodyPose[] = [];
  private poseIndex = new Map<string, BodyPose>();
  private snapshot?: PhysicsSnapshot;
  private clearance = false;
  private restored?: NonNullable<PhysicsRequest['initial']>['restored'];
  public timeoutMs = 5000;

  constructor(
    private readonly definition: WorldDefinition,
    private readonly playerId: string,
    private readonly position: WorldPosition,
    snapshot: PhysicsSnapshot | undefined,
    private readonly generation = 0,
    initialTick = 0,
  ) {
    this.snapshot = snapshot;
    this.tick = initialTick;
  }

  public syncStatic(values: Iterable<NamedCollider>): void {
    const next = [...values];
    const key = (value: NamedCollider) => `${value.source}:${value.id}`;
    const order = next.map(key);
    const set = next.filter(
      (value) => this.signatures.static.get(key(value)) !== JSON.stringify(value),
    );
    const retained = new Set(order);
    const remove = [...this.statics.keys()].filter((id) => !retained.has(id));
    for (const id of remove) {
      this.statics.delete(id);
      this.signatures.static.delete(id);
    }
    for (const value of set) {
      this.statics.set(key(value), value);
      this.signatures.static.set(key(value), JSON.stringify(value));
    }
    // Every original reconciliation is retained, including no-op calls, to preserve native ordering.
    this.add({ kind: 'static', set, remove, order });
  }

  public syncBodies(values: Iterable<PhysicsBodyDefinition>): void {
    const next = [...values];
    const order = next.map((value) => value.id);
    const set = next.filter(
      (value) => this.signatures.bodies.get(value.id) !== JSON.stringify(value),
    );
    const retained = new Set(order);
    const remove = [...this.bodies.keys()].filter((id) => !retained.has(id));
    for (const id of remove) {
      this.bodies.delete(id);
      this.signatures.bodies.delete(id);
    }
    for (const value of set) {
      this.bodies.set(value.id, value);
      this.signatures.bodies.set(value.id, JSON.stringify(value));
    }
    this.add({ kind: 'bodies', set, remove, order });
  }

  private add(delta: ColliderDelta): void {
    if (this.disposed || this.deltas.length >= 1024 || delta.order.length > 250000)
      throw new Error('Physics collider delta backpressure');
    this.deltas.push(structuredClone(delta));
    ++this.revision;
  }

  public assertClearance(): void {
    this.clearance = true;
  }
  public assertRestoredState(
    position: WorldPosition,
    bodies: { id: string; position: WorldPosition; rotation: WorldRotation }[],
  ): void {
    this.restored = structuredClone({ position, bodies });
  }

  public async prepare(): Promise<void> {
    if (this.started || this.disposed) throw new Error('Invalid physics preparation boundary');
    this.started = true;
    const channel = new MessageChannel();
    this.port = channel.port1;
    try {
      this.worker = new Worker(new URL('./physics.worker', import.meta.url), {
        type: 'module',
        name: 'scrapworks-physics',
      });
    } catch (error) {
      channel.port2.close();
      this.dispose();
      throw error;
    }
    this.subscriptions.add(
      fromEvent<MessageEvent<unknown>>(this.port, 'message').subscribe((event) => {
        const pending = this.pending;
        if (!pending) return; // Duplicate or retired result cannot mutate any cached authority.
        try {
          if (!event.data || typeof event.data !== 'object')
            throw new Error('Malformed physics reply');
          const reply = event.data as PhysicsReply;
          if (reply.id < pending.request.id || reply.generation < this.generation) return;
          requireMatchingReply(pending.request, reply);
          this.pending = undefined;
          clearTimeout(pending.timer);
          pending.resolve(reply);
        } catch (error) {
          this.fail(error);
        }
      }),
    );
    this.subscriptions.add(
      fromEvent(this.port, 'messageerror').subscribe(() =>
        this.fail(new Error('Physics reply decoding failed')),
      ),
    );
    this.subscriptions.add(
      fromEvent<ErrorEvent>(this.worker, 'error').subscribe((event) => {
        event.preventDefault();
        this.fail(new Error(event.message || 'Physics worker failed'));
      }),
    );
    this.port.start();
    try {
      this.worker.postMessage({ port: channel.port2 }, [channel.port2]);
      await this.request('initialize', this.tick, undefined, {
        definition: this.definition,
        playerId: this.playerId,
        position: this.position,
        snapshot: this.snapshot,
        clearance: this.clearance,
        restored: this.restored,
      });
      this.snapshot = undefined;
    } catch (error) {
      channel.port2.close();
      this.dispose();
      throw error;
    }
  }

  private async request(
    operation: PhysicsRequest['operation'],
    tick: number,
    motion?: Motion,
    initial?: PhysicsRequest['initial'],
  ): Promise<PhysicsReply> {
    if (!this.port || this.disposed || this.failure)
      throw this.failure ?? new Error('Disposed/unprepared physics worker');
    if (this.pending) throw new Error('Only one physics request may be outstanding');
    const request: PhysicsRequest = {
      protocol: 1,
      id: ++this.serial,
      generation: this.generation,
      tick,
      substepTarget: tick * 3,
      colliderRevision: this.revision,
      operation,
      deltas: this.deltas,
      motion,
      initial,
    };
    this.deltas = [];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error('Physics worker timed out')),
        this.timeoutMs,
      );
      this.pending = { request, resolve, reject, timer };
      try {
        this.port!.postMessage(request);
      } catch (error) {
        this.fail(error);
      }
    });
  }

  public async moveAsync(motion: Motion): Promise<WorldPosition> {
    if (motion.tick !== this.tick) throw new Error('Physics logical tick gap');
    const result = await this.request('tick', this.tick + 1, motion);
    if (!result.position || !result.poses) {
      this.fail(new Error('Missing resolved physics poses'));
      throw this.failure!;
    }
    ++this.tick;
    this.poses = result.poses;
    this.poseIndex = new Map(result.poses.map((pose) => [pose.id, pose]));
    return result.position;
  }

  /** Post-movement structural edits require an acknowledgement before publishing the logical boundary. */
  public async flush(): Promise<void> {
    if (this.deltas.length) await this.request('flush', this.tick);
  }
  public async prepareCapture(): Promise<void> {
    const result = await this.request('capture', this.tick);
    if (!result.snapshot) throw new Error('Missing native physics capture');
    this.snapshot = result.snapshot;
  }
  public capture(): PhysicsSnapshot {
    if (!this.snapshot) throw new Error('Native capture was not prepared');
    const snapshot = this.snapshot;
    this.snapshot = undefined;
    return snapshot;
  }
  public changedBodies(): Iterable<string> {
    return this.poses.map((pose) => pose.id);
  }
  public pose(id: string): Omit<BodyPose, 'id'> {
    const pose = this.poseIndex.get(id);
    if (!pose) throw new Error('Missing resolved body pose');
    return pose;
  }
  public movePlayer(_x: number, _z: number, _tick: number): WorldPosition {
    throw new Error('C1 physics must yield through moveAsync');
  }

  private fail(cause: unknown): void {
    if (this.failure) return;
    this.failure = cause instanceof Error ? cause : new Error(String(cause));
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.subscriptions.unsubscribe();
    this.port?.close();
    this.worker?.terminate();
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fail(new Error('Physics world disposed'));
    this.deltas = [];
    this.poses = [];
    this.poseIndex.clear();
    this.statics.clear();
    this.bodies.clear();
  }
}
