import { Miniplex } from '../ecs-bench/adapters/miniplex.ts';
import { BitECS } from '../ecs-bench/adapters/bitecs.ts';
import type { Instance, Projection } from '../ecs-bench/model.ts';
import { Simulation } from '../../src/simulation/simulation.ts';
import type { WorldDefinition, WorldView } from '../../src/contracts/world.ts';
import { assert, Credits, epoch, validRequest } from './protocol.ts';
import type { Command, Ledger, Options, Reply, Request, Times } from './protocol.ts';

const zero = (): Times => ({
  systems: 0,
  structural: 0,
  publication: 0,
  packing: 0,
  execution: 0,
  stepSamples: [],
});
export const definition: WorldDefinition = {
  version: 1,
  id: 'worker-movement-fixture',
  grid: { origin: { x: -10, z: -10 }, columns: 10, rows: 10, metresPerCell: 2 },
  terrain: Array.from({ length: 100 }, () => 'soil'),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [
    {
      id: 'scrap',
      kind: 'scrap',
      quantity: 100,
      position: { x: -3, y: 0, z: 1 },
      footprint: { width: 1, depth: 1 },
      rotation: 0,
    },
  ],
  blockers: [
    {
      id: 'blocker',
      position: { x: 3, y: 0, z: -1 },
      footprint: { width: 1, depth: 1 },
      rotation: 0,
    },
  ],
};
export function movementProbe(): WorldView[] {
  const simulation = new Simulation(definition, { developerFixture: true });
  const views: WorldView[] = [];
  for (let i = 0; i < 1000; i++) {
    if (i % 79 === 0)
      simulation.enqueue({
        type: 'place',
        buildingId: 'test-building',
        cell: { column: i % 10, row: 3 },
        rotation: 0,
      });
    if (i % 113 === 0) simulation.clearInput();
    simulation.step({ x: i % 160 < 80 ? 1 : -1, z: i % 100 < 50 ? 1 : -1, sprint: i % 70 < 20 });
    if (i % 10 === 0 || i === 999) views.push(simulation.view);
  }
  return views;
}

/** Isolated coordinator. Workers never share a mutable ECS world. */
export class Runtime {
  private world?: Instance;
  private options?: Options;
  private generation = -1;
  private revision = 0;
  private version = 0;
  private lastRequest = 0;
  private paused = true;
  private failed = false;
  private failNext = false;
  private busy = false;
  private commands: Command[] = [];
  private ledger: Ledger = {
    accepted: 0,
    applied: 0,
    checksum: 0,
    lastSequence: 0,
    appliedSequence: 0,
    input: { x: 0, z: 0, sprint: false },
  };
  private posts: number[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private clockCredits = new Credits();
  private clockLast = 0;
  private clockRunning = false;
  private unpublished?: Projection;
  public recordPost(ms: number): void {
    if (this.posts.length < 4096) this.posts.push(ms);
  }
  private make(r: Request): Reply {
    return {
      protocol: 1,
      generation: r.generation,
      revision: this.revision,
      id: r.id,
      ok: true,
      receivedEpoch: epoch(),
      producedEpoch: 0,
      tick: this.world?.resources.tick ?? 0,
      steps: 0,
      times: zero(),
    };
  }
  private finish(reply: Reply, view?: Projection): Reply {
    reply.tick = this.world?.resources.tick ?? 0;
    reply.revision = this.revision;
    if (view) {
      const frame = { version: ++this.version, base: this.version - 1, view };
      if (this.options?.wire === 'json-buffer') {
        const start = performance.now();
        reply.packed = new TextEncoder().encode(JSON.stringify(frame)).buffer as ArrayBuffer;
        reply.times.packing = performance.now() - start;
      } else reply.frame = frame;
    }
    reply.ledger = { ...this.ledger, input: { ...this.ledger.input } };
    reply.producedEpoch = epoch();
    return reply;
  }
  private step(reply: Reply): void {
    const world = this.world!;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Injected simulation failure');
    }
    for (const command of this.commands) {
      this.ledger.applied++;
      this.ledger.appliedSequence = command.sequence;
      this.ledger.checksum = (Math.imul(this.ledger.checksum, 31) + command.value) >>> 0;
    }
    this.commands = [];
    const start = performance.now();
    const pending = world.step();
    assert(!pending, 'Selected candidate unexpectedly became asynchronous');
    reply.times.stepSamples.push(performance.now() - start);
    reply.times.systems += world.phases.systems;
    reply.times.structural += world.phases.structural;
    reply.steps++;
  }
  private project(reply: Reply, full = false): Projection {
    const start = performance.now();
    const projection = this.world!.project(full);
    assert(!(projection instanceof Promise), 'Unexpected asynchronous projection');
    reply.times.publication += performance.now() - start;
    return projection;
  }
  private accept(r: Request): void {
    if (r.input) this.ledger.input = { ...r.input };
    for (const c of r.commands ?? []) {
      if (c.sequence <= this.ledger.lastSequence) continue;
      assert(c.sequence === this.ledger.lastSequence + 1, 'Command sequence gap');
      assert(this.commands.length < 256, 'Command backpressure');
      this.commands.push(c);
      this.ledger.lastSequence = c.sequence;
      this.ledger.accepted++;
    }
  }
  private stopClock(): void {
    this.clockRunning = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.clockCredits.clear();
  }
  private clockTurn(): void {
    if (!this.clockRunning || this.paused || this.failed) return;
    const now = performance.now();
    this.clockCredits.add(now - this.clockLast);
    this.clockLast = now;
    const count = this.clockCredits.take(1);
    if (count) {
      const dummy = this.make({
        protocol: 1,
        generation: this.generation,
        revision: this.revision,
        id: 0,
        sentEpoch: epoch(),
        operation: 'advance',
      });
      // Do not clear dirty records until polled. Intermediate removals remain intact.
      try {
        this.step(dummy);
      } catch {
        this.failed = true;
        this.stopClock();
      }
    }
    this.timer = setTimeout(() => this.clockTurn(), 5);
  }
  public handle(value: unknown): Reply | Promise<Reply> {
    validRequest(value);
    const r = value;
    const reply = this.make(r);
    try {
      if (r.operation === 'initialize') {
        assert(r.generation > this.generation, 'Stale initialization generation');
        assert(
          r.options && ['miniplex', 'bitecs'].includes(r.options.candidate),
          'Invalid candidate',
        );
        assert(Number.isSafeInteger(r.options.seed), 'Invalid seed');
        assert(
          Number.isInteger(r.options.size) &&
            r.options.size >= 1000 &&
            r.options.size <= 250000 &&
            r.options.size % 1000 === 0,
          'Invalid scale',
        );
        assert(
          ['mixed', 'idle', 'active', 'churn'].includes(r.options.workload),
          'Invalid workload',
        );
        this.stopClock();
        const replacement =
          r.options.candidate === 'miniplex'
            ? new Miniplex(r.options, r.capture?.world)
            : new BitECS(r.options, r.capture?.world);
        this.world?.dispose();
        this.options = r.options;
        this.world = replacement;
        this.busy = false;
        this.clockCredits = new Credits();
        this.generation = r.generation;
        this.revision = r.revision;
        this.lastRequest = r.id;
        this.version = 0;
        this.commands = [];
        this.ledger = r.capture
          ? structuredClone(r.capture.ledger)
          : {
              accepted: 0,
              applied: 0,
              checksum: 0,
              lastSequence: 0,
              appliedSequence: 0,
              input: { x: 0, z: 0, sprint: false },
            };
        this.paused = false;
        this.failed = false;
        this.failNext = false;
        this.posts = [];
        return this.finish(reply, this.project(reply, true));
      }
      if (r.operation === 'dispose' && !this.world && r.generation === this.generation)
        return this.finish(reply);
      assert(this.world && r.generation === this.generation, 'Stale world generation');
      assert(r.id > this.lastRequest, 'Duplicate or reordered request');
      this.lastRequest = r.id;
      if (r.operation === 'dispose') {
        this.stopClock();
        this.world.dispose();
        this.world = undefined;
        this.options = undefined;
        this.commands = [];
        this.unpublished = undefined;
        this.posts = [];
        return this.finish(reply);
      }
      if (r.operation === 'stats') {
        reply.posts = [...this.posts];
        reply.clock = {
          droppedMs: this.clockCredits.dropped,
          maxBacklog: this.clockCredits.max,
          busy: this.busy,
        };
        return this.finish(reply);
      }
      if (r.operation === 'pause' || r.operation === 'resume') {
        assert(r.revision >= this.revision, 'Stale activity revision');
        this.stopClock();
        this.revision = r.revision;
        this.paused = r.operation === 'pause';
        this.commands = [];
        this.ledger.input = { x: 0, z: 0, sprint: false };
        return this.finish(reply);
      }
      assert(!this.failed, 'Failed session requires replacement');
      assert(r.revision === this.revision, 'Stale input revision');
      if (r.operation === 'capture') {
        assert(!this.busy, 'Capture requires completed batch');
        const snapshot = this.world.capture();
        assert(!(snapshot instanceof Promise), 'Unexpected asynchronous capture');
        reply.capture = { world: snapshot, ledger: structuredClone(this.ledger) };
        return this.finish(reply);
      }
      if (r.operation === 'movement') {
        reply.movement = movementProbe();
        return this.finish(reply);
      }
      if (r.operation === 'fail') {
        this.failNext = true;
        return this.finish(reply);
      }
      if (r.operation === 'dirty') {
        this.world.setDirty(r.fraction ?? 0);
        return this.finish(reply, this.project(reply, r.full));
      }
      if (r.operation === 'clock-stop') {
        this.stopClock();
        return this.finish(reply);
      }
      if (r.operation === 'clock-start') {
        assert(!this.paused, 'Clock cannot run paused');
        this.stopClock();
        this.clockRunning = true;
        this.clockLast = performance.now();
        this.clockTurn();
        return this.finish(reply);
      }
      if (r.operation === 'clock-poll') {
        if (this.paused) return this.finish(reply);
        this.accept(r);
        return this.finish(reply, this.project(reply));
      }
      assert(r.operation === 'advance' && !this.clockRunning, 'Cannot mix clocks');
      if (this.paused) return this.finish(reply);
      assert(!this.busy, 'Advance backpressure');
      this.accept(r);
      this.busy = true;
      const revision = this.revision;
      const generation = this.generation;
      const start = performance.now();
      const finish = (): Reply => {
        if (this.generation !== generation)
          return { ...reply, ok: false, error: 'World replaced', producedEpoch: epoch() };
        reply.times.execution = performance.now() - start;
        this.busy = false;
        return this.finish(reply, reply.steps ? this.project(reply) : undefined);
      };
      if (r.yieldSteps || r.delayMs) {
        return (async () => {
          try {
            if (r.delayMs) await new Promise((resolve) => setTimeout(resolve, r.delayMs));
            for (let n = 0; n < (r.steps ?? 1); n++) {
              if (
                this.paused ||
                this.revision !== revision ||
                this.generation !== generation ||
                !this.world
              )
                break;
              this.step(reply);
              if (r.yieldSteps) await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return finish();
          } catch (error) {
            if (this.generation === generation) {
              this.busy = false;
              this.failed = true;
            }
            return { ...this.finish(reply), ok: false, error: String(error) };
          }
        })();
      }
      for (let n = 0; n < (r.steps ?? 1); n++) this.step(reply);
      return finish();
    } catch (error) {
      if (
        r.operation === 'advance' &&
        r.generation === this.generation &&
        r.revision === this.revision
      ) {
        this.failed = true;
        this.busy = false;
      }
      return { ...this.finish(reply), ok: false, error: String(error) };
    }
  }
}
