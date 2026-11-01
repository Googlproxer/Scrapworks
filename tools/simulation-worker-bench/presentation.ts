import type { Base } from '../ecs-bench/base.ts';
import { copyRecord } from '../ecs-bench/model.ts';
import type { Kind, RecordData } from '../ecs-bench/model.ts';
import { assert } from './protocol.ts';

/** Synthetic render/HUD fields. Inventories, recipes and ownership are inspected on demand. */
export const stride = 12;
const kinds: readonly Kind[] = ['processor', 'owner', 'deposit', 'pile'];
export const defaultDetails = ['entity-6-0', 'entity-0-0'];
export const maxDetails = 16;
export interface LeanFrame {
  schema: 1;
  version: number;
  base: number;
  full: boolean;
  population: number;
  tick: number;
  completed: number;
  count: number;
  rows: ArrayBuffer;
  removed: ArrayBuffer;
  details: RecordData[];
}
/** Float64 throughout: no reduction in authoritative numeric precision. */
function writeRow(out: Float64Array, at: number, r: RecordData, tick: number): void {
  const p = r.payload;
  out[at] = p.ordinal;
  out[at + 1] = p.generation;
  out[at + 2] = kinds.indexOf(p.kind);
  out[at + 3] = p.position.x;
  out[at + 4] = p.position.z;
  out[at + 5] = p.status;
  out[at + 6] = r.work;
  out[at + 7] = r.charge;
  out[at + 8] = r.quantity;
  out[at + 9] = p.reserved;
  out[at + 10] = p.held;
  out[at + 11] = tick;
}
/** Allocate only presentation buffers and at most 16 detached detail records. */
export function publishLean(
  world: Base,
  watched: ReadonlySet<string>,
  version: number,
  full = false,
): LeanFrame {
  let rows = new Float64Array(0);
  let offset = 0;
  const details: RecordData[] = [];
  const meta = world.publishTo(
    (count) => {
      rows = new Float64Array(count * stride);
    },
    (record) => {
      writeRow(rows, offset, record, world.resources.tick);
      offset += stride;
      if (watched.has(record.payload.id)) details.push(copyRecord(record));
    },
    full,
  );
  const removed = new Float64Array(meta.removed.length * 2);
  for (let i = 0; i < meta.removed.length; i++) {
    const id = meta.removed[i];
    const split = id.lastIndexOf('-');
    removed[i * 2] = Number(id.slice(7, split));
    removed[i * 2 + 1] = Number(id.slice(split + 1));
  }
  return {
    schema: 1,
    version,
    base: version - 1,
    full,
    population: world.size,
    tick: meta.tick,
    completed: meta.completed,
    count: offset / stride,
    rows: rows.buffer as ArrayBuffer,
    removed: removed.buffer as ArrayBuffer,
    details,
  };
}

/** Host-owned storage. No authoritative component buffer crosses the boundary. */
export class PresentationCache {
  public values: Float64Array;
  public present: Uint8Array;
  public readonly details = new Map<string, RecordData>();
  public constructor(public size: number) {
    this.values = new Float64Array(size * stride);
    this.present = new Uint8Array(size);
  }
  public apply(frame: LeanFrame): void {
    assert(
      frame.schema === 1 &&
        Number.isInteger(frame.population) &&
        frame.population >= 1000 &&
        frame.population <= 250000 &&
        (frame.population === this.size || frame.full),
      'Invalid presentation schema/size',
    );
    const size = frame.population;
    assert(
      Number.isInteger(frame.count) && frame.count >= 0 && frame.count <= size,
      'Invalid row count',
    );
    assert(frame.rows.byteLength === frame.count * stride * 8, 'Invalid presentation buffer');
    assert(frame.removed.byteLength % 16 === 0, 'Invalid removal buffer');
    assert(frame.details.length <= maxDetails, 'Detail overflow');
    const rows = new Float64Array(frame.rows);
    const removed = new Float64Array(frame.removed);
    // Validate before mutating a completed presentation, including malformed removals.
    for (let i = 0; i < rows.length; i += stride) {
      assert(Number.isInteger(rows[i]) && rows[i] >= 0 && rows[i] < size, 'Invalid row identity');
      assert(Number.isSafeInteger(rows[i + 1]) && rows[i + 1] >= 0, 'Invalid row generation');
      if (frame.full) assert(rows[i] === i / stride, 'Full rows must be ordered and complete');
    }
    for (let i = 0; i < removed.length; i += 2)
      assert(
        Number.isInteger(removed[i]) &&
          removed[i] >= 0 &&
          removed[i] < size &&
          Number.isSafeInteger(removed[i + 1]) &&
          removed[i + 1] >= 0,
        'Invalid removed identity',
      );
    assert(!frame.full || frame.count === size, 'Incomplete full presentation');
    if (this.size !== size) {
      this.size = size;
      this.values = new Float64Array(size * stride);
      this.present = new Uint8Array(size);
    }
    for (let i = 0; i < removed.length; i += 2) {
      const ordinal = removed[i];
      if (this.values[ordinal * stride + 1] === removed[i + 1]) this.present[ordinal] = 0;
      this.details.delete(`entity-${ordinal}-${removed[i + 1]}`);
    }
    if (frame.full) {
      this.values.set(rows);
      this.present.fill(1);
      this.details.clear();
    } else
      for (let i = 0; i < rows.length; i += stride) {
        const ordinal = rows[i];
        for (let field = 0; field < stride; field++)
          this.values[ordinal * stride + field] = rows[i + field];
        this.present[ordinal] = 1;
      }
    for (const detail of frame.details) this.details.set(detail.payload.id, detail);
  }
  /** Untimed comparison against full authority; omitted fields are deliberately not inferred. */
  public verify(records: readonly RecordData[], watched: readonly string[]): void {
    assert(records.length === this.size, 'Presentation population mismatch');
    const expected = new Float64Array(stride);
    for (const record of records) {
      const ordinal = record.payload.ordinal;
      const offset = ordinal * stride;
      writeRow(expected, 0, record, this.values[offset + 11]);
      assert(this.present[ordinal], 'Missing presented entity');
      for (let field = 0; field < stride - 1; field++)
        assert(
          this.values[offset + field] === expected[field],
          `Presentation mismatch ${ordinal}/${field}`,
        );
    }
    const expectedDetails = records.filter((record) => watched.includes(record.payload.id));
    assert(this.details.size === expectedDetails.length, 'Stale/missing detail subscription');
    for (const record of expectedDetails)
      assert(
        JSON.stringify(this.details.get(record.payload.id)) === JSON.stringify(record),
        'Nested detail mismatch',
      );
  }
}
