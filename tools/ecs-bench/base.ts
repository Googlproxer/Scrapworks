import { copyRecord, recordFor, resourcesFor, spendInOrder } from './model.ts';
import type { Fixture, Instance, Projection, RecordData, Resources, Snapshot } from './model.ts';

/** Shared orchestration, not shared component access inside native query loops. */
export abstract class Base implements Instance {
  public readonly resources: Resources;
  public readonly phases = { systems: 0, structural: 0 };
  protected count = 0;
  protected dirty: number[] = [];
  protected flags = new Uint8Array(0);
  protected removed: string[] = [];
  protected disposed = false;
  private profilingDirty = false;
  private dirtyStats = { calls: 0, unique: 0, selfMs: 0 };
  protected constructor(
    public readonly fixture: Fixture,
    snapshot?: Snapshot,
  ) {
    this.resources = snapshot ? structuredClone(snapshot.resources) : resourcesFor(fixture.size);
  }
  public get size(): number {
    return this.count;
  }
  protected abstract insert(record: RecordData): void;
  protected abstract remove(ordinal: number): void;
  protected abstract read(ordinal: number): RecordData;
  protected abstract quantity(ordinal: number, value: number): void;
  protected abstract systems(): void | Promise<void>;
  protected abstract shutdown(): void | Promise<void>;
  protected abstract membership(ordinal: number, active: boolean): void;
  protected structural(action: () => void): void {
    action();
  }
  protected initialize(snapshot?: Snapshot): void {
    this.flags = new Uint8Array(this.fixture.size);
    for (let i = 0; i < this.fixture.size; i++)
      this.insert(snapshot ? structuredClone(snapshot.records[i]) : recordFor(i, this.fixture));
    this.count = this.fixture.size;
  }
  protected mark(ordinal: number): void {
    const start = this.profilingDirty ? performance.now() : 0;
    if (this.profilingDirty) this.dirtyStats.calls++;
    if (!this.flags[ordinal]) {
      this.flags[ordinal] = 1;
      this.dirty.push(ordinal);
    }
    if (this.profilingDirty) {
      this.dirtyStats.unique = this.dirty.length;
      this.dirtyStats.selfMs += performance.now() - start;
    }
  }
  public instrumentDirty(enabled: boolean): void {
    this.profilingDirty = enabled;
    this.dirtyStats = { calls: 0, unique: 0, selfMs: 0 };
  }
  public dirtyDiagnostics(): { calls: number; unique: number; selfMs: number } {
    return { ...this.dirtyStats };
  }
  public step(): void | Promise<void> {
    if (this.disposed) throw new Error('Disposed benchmark world');
    const start = performance.now();
    const pending = this.systems();
    if (pending)
      return pending.then(() => {
        this.phases.systems = performance.now() - start;
        this.commit();
      });
    this.phases.systems = performance.now() - start;
    this.commit();
  }
  protected commit(): void {
    const start = performance.now();
    this.structural(() => {
      this.resources.tick++;
      // One nested bag edit per hundred owners; no unbounded command log.
      const groups = this.count / 10;
      for (let g = this.resources.tick % 100; g < groups; g += 100) {
        const ordinal = g * 10 + 6;
        const data = this.read(ordinal).payload;
        const slot = data.slots[0]!;
        slot.quantity = slot.quantity === 50 ? 49 : 50;
        this.mark(ordinal);
        const deposit = g * 10 + 8;
        const pile = deposit + 1;
        const remaining = this.read(deposit).quantity;
        this.quantity(deposit, remaining > 0 ? remaining - 1 : 250000);
        this.quantity(pile, this.read(pile).quantity + 1);
        this.resources.extracted++;
        this.mark(deposit);
        this.mark(pile);
      }
      const bag = this.read(6).payload.slots[0]!;
      bag.quantity = 3; // Explicit synthetic inflow keeps the contention fixture supplied.
      this.resources.injected += 3;
      const payment = spendInOrder(bag.quantity);
      bag.quantity = payment.left;
      this.mark(6);
      this.resources.manual += payment.manual;
      this.resources.research += payment.research;
      this.resources.transferred += payment.processor;
      if (this.fixture.workload === 'churn') {
        const replacements = this.count / 100;
        const first = (this.resources.tick * replacements) % this.count;
        for (let n = 0; n < replacements; n++) {
          const ordinal = (first + n) % this.count;
          const before = this.read(ordinal);
          this.removed.push(before.payload.id);
          this.remove(ordinal);
          const next = recordFor(ordinal, this.fixture, before.payload.generation + 1);
          this.insert(next);
          this.resources.nextId++;
          this.mark(ordinal);
        }
        // Repair game-owned links after replacement, never persist library IDs.
        for (let n = 0; n < replacements; n++) {
          const ordinal = (first + n) % this.count;
          if (ordinal % 10 < 8 && ordinal % 10 >= 6) {
            for (let p = Math.floor(ordinal / 10) * 10 + (ordinal % 2); p % 10 < 6; p += 2) {
              this.read(p).payload.owner = this.read(ordinal).payload.id;
              this.mark(p);
            }
          } else if (ordinal % 10 < 6) {
            this.read(ordinal).payload.owner = this.read(
              Math.floor(ordinal / 10) * 10 + 6 + (ordinal % 2),
            ).payload.id;
          }
        }
      }
    });
    this.phases.structural = performance.now() - start;
  }
  protected projectNow(full = false): Projection {
    // Deep detachment includes slots, buffers and reservations, not just a shallow DTO.
    const view: Projection = {
      tick: this.resources.tick,
      completed: this.resources.completed,
      records: full
        ? Array.from({ length: this.count }, (_, i) => copyRecord(this.read(i)))
        : this.dirty.map((i) => copyRecord(this.read(i))),
      removed: [...this.removed],
    };
    this.dirty.forEach((i) => {
      this.flags[i] = 0;
    });
    this.dirty = [];
    this.removed = [];
    return view;
  }
  public project(full = false): Projection | Promise<Projection> {
    return this.projectNow(full);
  }
  /** Alternate detached publishers visit authoritative rows only at a tick boundary. */
  public publishTo(
    begin: (count: number) => void,
    write: (record: RecordData) => void,
    full = false,
  ): Omit<Projection, 'records'> {
    begin(full ? this.count : this.dirty.length);
    if (full) for (let i = 0; i < this.count; i++) write(this.read(i));
    else for (const ordinal of this.dirty) write(this.read(ordinal));
    const result = {
      tick: this.resources.tick,
      completed: this.resources.completed,
      removed: this.removed,
    };
    for (const ordinal of this.dirty) this.flags[ordinal] = 0;
    this.dirty = [];
    this.removed = [];
    return result;
  }
  /** Bounded, detached inspection; stale game-owned IDs never resolve to recycled entities. */
  public inspect(ids: readonly string[]): RecordData[] {
    const result: RecordData[] = [];
    for (const id of ids) {
      const ordinal = Number(id.split('-')[1]);
      if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= this.count) continue;
      const record = this.read(ordinal);
      if (record.payload.id === id) result.push(copyRecord(record));
    }
    return result;
  }
  protected captureNow(): Snapshot {
    return {
      version: 1,
      fixture: { ...this.fixture, size: this.count },
      resources: structuredClone(this.resources),
      records: structuredClone(Array.from({ length: this.count }, (_, i) => this.read(i))),
    };
  }
  public capture(): Snapshot | Promise<Snapshot> {
    return this.captureNow();
  }
  public grow(size: number): void | Promise<void> {
    if (size < this.count || size % 10 !== 0)
      throw new Error('Growth must be a nondecreasing multiple of ten');
    const flags = new Uint8Array(size);
    flags.set(this.flags);
    this.flags = flags;
    for (let i = this.count; i < size; i++) {
      this.insert(recordFor(i, this.fixture));
      this.mark(i);
    }
    this.count = size;
    this.resources.nextId = Math.max(this.resources.nextId, size);
  }
  public setDirty(fraction: number): void {
    this.dirty.forEach((i) => {
      this.flags[i] = 0;
    });
    this.dirty = [];
    for (let i = 0; i < Math.floor(this.count * fraction); i++) this.mark(i);
  }
  public probe(): void | Promise<void> {
    const ordinal = 0;
    this.read(ordinal).payload.status = 1;
    this.membership(ordinal, false);
    this.read(ordinal).payload.status = 0;
    this.membership(ordinal, true);
  }
  public dispose(): void | Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.dirty = [];
    this.removed = [];
    this.flags = new Uint8Array(0);
    return this.shutdown();
  }
}
