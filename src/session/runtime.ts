import type { RuntimeEvent } from '@contracts/session-event';
import type {
  CommandLedger,
  RuntimeReply,
  RuntimeRequest,
  PresentationPacket,
  Inspection,
  SimulationCapture,
  SequencedCommand,
  SimulationInput,
} from '@contracts/simulation';
import {
  MAX_DETAIL_SUBSCRIPTIONS,
  MAX_PENDING_COMMANDS,
  requireInvariant as check,
} from '@contracts/simulation';
import { Simulation } from '@simulation/simulation';
import { validWorldCommand } from '../contracts/world-command';

function assertCommandBatch(commands: unknown): asserts commands is SequencedCommand[] {
  check(Array.isArray(commands) && commands.length <= MAX_PENDING_COMMANDS, 'Command overflow');
  for (const value of commands) {
    const command = value as Partial<SequencedCommand> | null;
    check(
      command &&
        Number.isSafeInteger(command.sequence) &&
        command.sequence! > 0 &&
        validWorldCommand(command.command),
      'Invalid command',
    );
  }
}

export function assertRequest(value: unknown): asserts value is RuntimeRequest {
  check(!!value && typeof value === 'object', 'Invalid session request');
  const r = value as Partial<RuntimeRequest>;
  check(
    r.protocol === 2 &&
      Number.isSafeInteger(r.id) &&
      Number.isSafeInteger(r.generation) &&
      Number.isSafeInteger(r.revision),
    'Invalid session envelope',
  );
  check(
    [
      'initialize',
      'advance',
      'activity',
      'watch',
      'inspect',
      'capture',
      'resync',
      'dispose',
    ].includes(String(r.operation)),
    'Unknown operation',
  );
  const fields: Record<RuntimeRequest['operation'], readonly string[]> = {
    initialize: ['definition', 'developerFixture', 'capture'],
    advance: ['steps', 'input', 'inputSequence', 'commands'],
    activity: ['active', 'commands'],
    watch: ['watch'],
    inspect: ['watch'],
    capture: [],
    resync: [],
    dispose: [],
  };
  for (const [key, field] of Object.entries(r))
    check(
      field === undefined ||
        ['protocol', 'id', 'generation', 'revision', 'operation', ...fields[r.operation!]].includes(
          key,
        ),
      'Unexpected operation payload',
    );
  if (r.operation === 'initialize') check(!!r.definition, 'Missing world definition');
  if (r.operation === 'advance') check(r.steps !== undefined, 'Missing step credits');
  if (r.operation === 'activity') check(typeof r.active === 'boolean', 'Missing activity');
  if (r.operation === 'watch' || r.operation === 'inspect')
    check(Array.isArray(r.watch), 'Missing watch list');
  if (r.steps !== undefined)
    check(Number.isInteger(r.steps) && r.steps >= 0 && r.steps <= 5, 'Invalid step credit');
  if (r.input)
    check(
      Number.isFinite(r.input.x) &&
        Number.isFinite(r.input.z) &&
        typeof r.input.sprint === 'boolean',
      'Invalid input',
    );
  if (r.inputSequence !== undefined)
    check(Number.isSafeInteger(r.inputSequence) && r.inputSequence >= 0, 'Invalid input sequence');
  if (r.watch)
    check(
      Array.isArray(r.watch) &&
        r.watch.length <= MAX_DETAIL_SUBSCRIPTIONS &&
        new Set(r.watch).size === r.watch.length &&
        r.watch.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256),
      'Invalid detail subscriptions',
    );
  if (r.commands !== undefined) assertCommandBatch(r.commands);
}

/** The same synchronous coordinator runs in the worker and the isolated inline control. */
export class SimulationRuntime {
  private world?: Simulation;
  private generation = -1;
  private revision = 0;
  private lastRequest = 0;
  private active = false;
  private failed = false;
  private watched = new Set<string>();
  private commands: SequencedCommand[] = [];
  private ledger: CommandLedger = { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 };
  private input: SimulationInput = { x: 0, z: 0, sprint: false };
  private inputSequence = 0;
  private appliedInput = 0;
  private eventSerial = 0;

  private accept(commands: readonly SequencedCommand[]): void {
    for (const command of commands) {
      if (command.sequence <= this.ledger.accepted) continue;
      check(
        command.sequence === this.ledger.accepted + 1 &&
          this.commands.length < MAX_PENDING_COMMANDS,
        'Command gap/backpressure',
      );
      this.commands.push(command);
      this.ledger.accepted = command.sequence;
    }
  }

  public dispose(): void {
    this.world?.dispose();
    this.world = undefined;
    this.commands = [];
    this.watched.clear();
  }

  public handle(value: unknown): RuntimeReply {
    assertRequest(value);
    const r = value;
    const reply: {
      packet?: PresentationPacket;
      details?: Inspection[];
      watch?: string[];
      capture?: SimulationCapture;
      completedTicks: number[];
      acknowledgements: import('@contracts/simulation').CommandAcknowledgement[];
      events: RuntimeEvent[];
    } = {
      completedTicks: [],
      acknowledgements: [],
      events: [],
    };

    const envelope = () => ({
      protocol: 2 as const,
      id: r.id,
      generation: r.generation,
      revision: this.revision,
      ledger: { ...this.ledger },
      appliedInput: this.appliedInput,
    });

    const finish = (): RuntimeReply => {
      // This closed operation switch verifies every required response payload.
      const common = {
        ...envelope(),
        completedTicks: reply.completedTicks,
        acknowledgements: reply.acknowledgements,
        events: reply.events,
        ok: true as const,
      };
      switch (r.operation) {
        case 'initialize':
        case 'resync':
          check(reply.packet, 'Missing publication');
          return { ...common, operation: r.operation, packet: reply.packet };
        case 'capture':
          check(reply.capture, 'Missing capture');
          return { ...common, operation: 'capture', capture: reply.capture };
        case 'watch':
          check(reply.details && reply.watch, 'Missing watched details');
          return { ...common, operation: 'watch', watch: reply.watch, details: reply.details };
        case 'inspect':
          check(reply.details, 'Missing inspection');
          return { ...common, operation: 'inspect', details: reply.details };
        case 'advance':
        case 'activity':
          return { ...common, operation: r.operation, packet: reply.packet };
        case 'dispose':
          return { ...common, operation: 'dispose' };
      }
    };

    const event = (tick: number, value: RuntimeEvent['event']) =>
      reply.events.push({ id: ++this.eventSerial, tick, event: value });

    try {
      if (r.operation === 'initialize') {
        check(r.generation > this.generation && r.definition, 'Stale/missing initialization');
        if (r.capture) {
          const l = r.capture.ledger;
          check(
            l &&
              [l.accepted, l.applied, l.cancelled, l.lastApplied].every(
                (n) => Number.isSafeInteger(n) && n >= 0,
              ) &&
              l.applied + l.cancelled + r.capture.pending.length === l.accepted &&
              l.lastApplied <= l.accepted,
            'Invalid continuation ledger',
          );
          check(r.capture.pending.length <= MAX_PENDING_COMMANDS, 'Continuation command overflow');
          assertCommandBatch(r.capture.pending);
          const sequences = r.capture.pending.map((c) => c.sequence);
          check(
            new Set(sequences).size === sequences.length &&
              sequences.every(
                (n, i) => n <= l.accepted && n > l.lastApplied && (!i || n > sequences[i - 1]),
              ),
            'Invalid pending command order',
          );
        }
        const next = new Simulation(r.definition, {
          snapshot: r.capture?.world,
          developerFixture: r.developerFixture,
        });
        this.world?.dispose();
        this.world = next;
        this.generation = r.generation;
        this.revision = r.revision;
        this.lastRequest = r.id;
        this.active = true;
        this.failed = false;
        this.input = { x: 0, z: 0, sprint: false };
        this.inputSequence = this.appliedInput = 0;
        this.commands = structuredClone(r.capture?.pending ?? []);
        this.ledger = structuredClone(
          r.capture?.ledger ?? { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
        );
        this.watched = new Set();
        this.eventSerial = 0;
        reply.packet = next.publish(this.watched, true);
        return finish();
      }
      check(
        r.generation === this.generation && r.id > this.lastRequest,
        'Stale/reordered session request',
      );
      this.lastRequest = r.id;
      if (r.operation === 'dispose') {
        this.world?.dispose();
        this.world = undefined;
        this.commands = [];
        this.watched.clear();
        this.active = false;
        return finish();
      }
      check(this.world, 'Disposed session');
      if (r.operation === 'activity') {
        check(
          r.revision >= this.revision && typeof r.active === 'boolean',
          'Stale/invalid activity',
        );
        this.revision = r.revision;
        this.active = r.active;
        this.accept(r.commands ?? []);
        for (const command of this.commands) {
          const acknowledgement = {
            sequence: command.sequence,
            tick: this.world.tick,
            result: 'cancelled' as const,
          };
          reply.acknowledgements.push(acknowledgement);
          event(this.world.tick, { kind: 'command-result', acknowledgement });
          this.ledger.cancelled++;
        }
        this.commands = [];
        this.input = { x: 0, z: 0, sprint: false };
        this.inputSequence = 0;
        if (!this.failed) {
          for (const value of this.world.clearInput()) event(this.world.tick, value);
          reply.packet = this.world.publish(this.watched);
        }
        return finish();
      }
      check(!this.failed, 'Failed session requires explicit restart');
      check(r.revision === this.revision, 'Stale input revision');
      if (r.operation === 'watch') {
        this.watched = new Set(r.watch ?? []);
        reply.details = this.world.inspect([...this.watched]);
        reply.watch = [...this.watched];
        return finish();
      }
      if (r.operation === 'inspect') {
        reply.details = this.world.inspect(r.watch ?? []);
        return finish();
      }
      if (r.operation === 'resync') {
        reply.packet = this.world.publish(this.watched, true);
        return finish();
      }
      if (r.operation === 'capture') {
        reply.capture = {
          world: this.world.capture(),
          ledger: structuredClone(this.ledger),
          pending: structuredClone(this.commands),
        };
        return finish();
      }
      check(r.operation === 'advance', 'Invalid operation');
      if (!this.active) return finish();
      this.accept(r.commands ?? []);
      if (r.input) {
        this.input = { ...r.input };
        this.inputSequence = r.inputSequence ?? 0;
      }
      for (let step = 0; step < (r.steps ?? 1); step++) {
        const commands = this.commands;
        this.commands = [];
        const result = this.world.step(
          this.input,
          commands.map((c) => c.command),
        );
        for (let i = 0; i < commands.length; i++) {
          const c = commands[i];
          this.ledger.applied++;
          this.ledger.lastApplied = c.sequence;
          const acknowledgement = {
            sequence: c.sequence,
            tick: this.world.tick,
            result: result.commandResults[i],
          };
          reply.acknowledgements.push(acknowledgement);
          event(this.world.tick, { kind: 'command-result', acknowledgement });
        }
        for (const value of result.events) event(this.world.tick, value);
        this.appliedInput = this.inputSequence;
        reply.completedTicks.push(this.world.tick);
      }
      if (reply.completedTicks.length) reply.packet = this.world.publish(this.watched);
      return finish();
    } catch (error) {
      if (r.operation === 'advance' && r.generation === this.generation) {
        this.failed = true;
        this.active = false;
      }
      return {
        ...envelope(),
        operation: r.operation,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        completedTicks: [],
        acknowledgements: [],
        events: [],
      };
    }
  }
}
