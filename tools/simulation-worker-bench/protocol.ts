import type { Fixture, Projection, Snapshot } from '../ecs-bench/model.ts';
import type { WorldView } from '../../src/contracts/world.ts';

export type Candidate = 'miniplex' | 'bitecs';
export type Execution = 'inline' | 'worker';
export type Clock = 'host' | 'worker';
export type Wire = 'object' | 'json-buffer';
export interface Options extends Fixture {
  candidate: Candidate;
  execution: Execution;
  wire?: Wire;
  clock?: Clock;
}
export interface Input {
  x: number;
  z: number;
  sprint: boolean;
}
export interface Command {
  sequence: number;
  value: number;
}
export interface Ledger {
  accepted: number;
  applied: number;
  checksum: number;
  lastSequence: number;
  appliedSequence: number;
  input: Input;
}
export interface Capture {
  world: Snapshot;
  ledger: Ledger;
}
export type Operation =
  | 'initialize'
  | 'advance'
  | 'pause'
  | 'resume'
  | 'capture'
  | 'dispose'
  | 'stats'
  | 'dirty'
  | 'fail'
  | 'movement'
  | 'clock-start'
  | 'clock-stop'
  | 'clock-poll';
export interface Request {
  protocol: 1;
  generation: number;
  revision: number;
  id: number;
  operation: Operation;
  sentEpoch: number;
  options?: Options;
  capture?: Capture;
  steps?: number;
  commands?: Command[];
  input?: Input;
  fraction?: number;
  full?: boolean;
  yieldSteps?: boolean;
  delayMs?: number;
}
export interface Times {
  systems: number;
  structural: number;
  publication: number;
  packing: number;
  execution: number;
  stepSamples: number[];
}
export interface Frame {
  version: number;
  base: number;
  view: Projection;
}
export interface Reply {
  protocol: 1;
  generation: number;
  revision: number;
  id: number;
  ok: boolean;
  error?: string;
  receivedEpoch: number;
  producedEpoch: number;
  tick: number;
  steps: number;
  frame?: Frame;
  packed?: ArrayBuffer;
  capture?: Capture;
  ledger?: Ledger;
  times: Times;
  posts?: number[];
  clock?: { droppedMs: number; maxBacklog: number; busy: boolean };
  movement?: WorldView[];
}
export const epoch = (): number => performance.timeOrigin + performance.now();
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validRequest(value: unknown): asserts value is Request {
  assert(value !== null && typeof value === 'object', 'Request must be an object');
  const r = value as Partial<Request>;
  assert(
    r.protocol === 1 &&
      Number.isSafeInteger(r.generation) &&
      Number.isSafeInteger(r.id) &&
      Number.isSafeInteger(r.revision) &&
      typeof r.operation === 'string' &&
      Number.isFinite(r.sentEpoch),
    'Invalid envelope',
  );
  assert(
    [
      'initialize',
      'advance',
      'pause',
      'resume',
      'capture',
      'dispose',
      'stats',
      'dirty',
      'fail',
      'movement',
      'clock-start',
      'clock-stop',
      'clock-poll',
    ].includes(r.operation),
    'Unknown operation',
  );
  if (r.steps !== undefined)
    assert(Number.isInteger(r.steps) && r.steps >= 0 && r.steps <= 5, 'Step credit must be 0..5');
  if (r.commands !== undefined) {
    assert(Array.isArray(r.commands) && r.commands.length <= 256, 'Command overflow');
    for (const c of r.commands)
      assert(
        c && Number.isSafeInteger(c.sequence) && c.sequence > 0 && Number.isSafeInteger(c.value),
        'Invalid command',
      );
  }
  if (r.input)
    assert(
      Number.isFinite(r.input.x) &&
        Number.isFinite(r.input.z) &&
        typeof r.input.sprint === 'boolean',
      'Invalid movement',
    );
  if (r.fraction !== undefined)
    assert(
      Number.isFinite(r.fraction) && r.fraction >= 0 && r.fraction <= 1,
      'Invalid dirty fraction',
    );
  if (r.delayMs !== undefined)
    assert(Number.isFinite(r.delayMs) && r.delayMs >= 0 && r.delayMs <= 5000, 'Invalid delay');
}
/** One accumulator; already dispatched steps consume the same five-step allowance. */
export class Credits {
  public elapsed = 0;
  public dropped = 0;
  public max = 0;
  public add(ms: number, outstanding = 0): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const limit = Math.max(0, 250 - outstanding * 50);
    const next = this.elapsed + ms;
    this.dropped += Math.max(0, next - limit);
    this.elapsed = Math.min(next, limit);
    this.max = Math.max(this.max, this.elapsed + outstanding * 50);
  }
  public take(max = 1): number {
    const steps = Math.min(max, Math.floor((this.elapsed + 1e-7) / 50));
    this.elapsed = Math.max(0, this.elapsed - steps * 50);
    return steps;
  }
  public clear(): void {
    this.elapsed = 0;
  }
}
