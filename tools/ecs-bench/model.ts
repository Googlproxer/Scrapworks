/** Synthetic fixtures only: none of these contracts are gameplay/save APIs. */
export type Candidate =
  | 'reference'
  | 'miniplex'
  | 'bitecs'
  | 'bitecs-arrays'
  | 'koota'
  | 'koota-update'
  | 'becsy'
  | 'becsy-checked';
export const primaries: Candidate[] = ['miniplex', 'bitecs', 'koota', 'becsy'];
export const diagnostics: Candidate[] = ['bitecs-arrays', 'koota-update', 'becsy-checked'];
export type Workload = 'mixed' | 'idle' | 'active' | 'churn';
export type Kind = 'processor' | 'owner' | 'deposit' | 'pile';
export interface Slot {
  item: string;
  quantity: number;
}
export interface Payload {
  ordinal: number;
  id: string;
  generation: number;
  kind: Kind;
  owner: string | null;
  position: { x: number; z: number };
  status: number;
  slots: (Slot | null)[];
  input: Slot[];
  output: Slot[];
  reserved: number;
  held: number;
  recipe: string;
}
export interface RecordData {
  payload: Payload;
  work: number;
  charge: number;
  quantity: number;
}
export interface Resources {
  tick: number;
  nextId: number;
  completed: number;
  injected: number;
  extracted: number;
  transferred: number;
  research: number;
  manual: number;
}
export interface Fixture {
  size: number;
  seed: number;
  workload: Workload;
  capacity?: number;
}
export interface Snapshot {
  version: 1;
  fixture: Fixture;
  resources: Resources;
  records: RecordData[];
}
export interface Projection {
  tick: number;
  completed: number;
  records: RecordData[];
  removed: string[];
}
export interface Phases {
  systems: number;
  structural: number;
}
export interface Instance {
  readonly fixture: Fixture;
  readonly resources: Resources;
  readonly phases: Phases;
  readonly size: number;
  step(): void | Promise<void>;
  project(full?: boolean): Projection | Promise<Projection>;
  capture(): Snapshot | Promise<Snapshot>;
  grow(size: number): void | Promise<void>;
  probe(): void | Promise<void>;
  setDirty(fraction: number): void;
  instrumentDirty(enabled: boolean): void;
  dirtyDiagnostics(): { calls: number; unique: number; selfMs: number };
  dispose(): void | Promise<void>;
}
export type Factory = (fixture: Fixture, snapshot?: Snapshot) => Instance | Promise<Instance>;

export function statusFor(ordinal: number, workload: Workload): number {
  const rank = (Math.floor(ordinal / 10) * 6 + (ordinal % 10)) % 100;
  if (workload === 'active') return 0;
  if (workload === 'idle') return rank < 1 ? 0 : rank < 90 ? 1 : 2;
  return rank < 20 ? 0 : rank < 80 ? 1 : 2;
}
export function recordFor(ordinal: number, fixture: Fixture, generation = 0): RecordData {
  const group = ordinal % 10;
  const kind: Kind =
    group < 6 ? 'processor' : group < 8 ? 'owner' : group === 8 ? 'deposit' : 'pile';
  return {
    payload: {
      ordinal,
      id: `entity-${ordinal}-${generation}`,
      generation,
      kind,
      position: { x: ordinal % 1000, z: Math.floor(ordinal / 1000) },
      owner:
        kind === 'processor'
          ? `entity-${Math.floor(ordinal / 10) * 10 + 6 + (ordinal % 2)}-0`
          : null,
      status: kind === 'processor' ? statusFor(ordinal, fixture.workload) : 1,
      slots:
        kind === 'owner'
          ? Array.from({ length: 24 }, (_, i) =>
              i < 8 ? { item: `item-${i}`, quantity: 50 } : null,
            )
          : [],
      input:
        kind === 'processor'
          ? [
              { item: 'item-0', quantity: 100 },
              { item: 'item-1', quantity: 100 },
            ]
          : [],
      output:
        kind === 'processor'
          ? [
              { item: 'item-2', quantity: 0 },
              { item: 'item-3', quantity: 0 },
            ]
          : [],
      reserved: kind === 'processor' ? 2 : 0,
      held: 0,
      recipe: kind === 'processor' ? `recipe-${ordinal % 4}` : '',
    },
    work: 20 + ((ordinal + fixture.seed) % 7),
    charge: 1200,
    quantity: kind === 'deposit' ? 250000 : kind === 'pile' ? 100 : 0,
  };
}
export function resourcesFor(size: number): Resources {
  return {
    tick: 0,
    nextId: size,
    completed: 0,
    injected: 0,
    extracted: 0,
    transferred: 0,
    research: 0,
    manual: 0,
  };
}
/** A bounded, continuously replenished synthetic operation; work never silently dries up. */
export function complete(payload: Payload, resources: Resources): number {
  payload.input[0].quantity--;
  payload.input[1].quantity--;
  payload.output[0].quantity++;
  payload.held = payload.output[0].quantity;
  if (payload.input[0].quantity === 0) {
    payload.input[0].quantity = payload.input[1].quantity = 100;
    resources.injected += 200;
  }
  if (payload.output[0].quantity === 100) {
    payload.output[0].quantity = payload.held = 0;
    resources.transferred += 100;
  }
  resources.completed++;
  return 20 + (payload.ordinal % 7);
}
/** Explicit priority: manual -> requested processor -> research, using one bag. */
export function spendInOrder(stock: number): {
  manual: number;
  processor: number;
  research: number;
  left: number;
} {
  const manual = Math.min(stock, 2);
  stock -= manual;
  const processor = Math.min(stock, 2);
  stock -= processor;
  const research = Math.min(stock, 2);
  stock -= research;
  return { manual, processor, research, left: stock };
}
export function canonical(snapshot: Snapshot): string {
  return JSON.stringify(snapshot);
}

/** Fixed-schema deep projection, shared by every adapter; retains no mutable aliases. */
export function copyRecord(record: RecordData): RecordData {
  const p = record.payload;
  return {
    payload: {
      ...p,
      position: { ...p.position },
      slots: p.slots.map((slot) => (slot ? { ...slot } : null)),
      input: p.input.map((slot) => ({ ...slot })),
      output: p.output.map((slot) => ({ ...slot })),
    },
    work: record.work,
    charge: record.charge,
    quantity: record.quantity,
  };
}
