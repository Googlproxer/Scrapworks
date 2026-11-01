import {
  addComponent,
  addEntity,
  commitRemovals,
  createWorld,
  deleteWorld,
  entityExists,
  query,
  removeComponent,
  removeEntity,
  isNested,
} from 'bitecs';
import { Base } from '../base.ts';
import { complete } from '../model.ts';
import type { Fixture, Payload, RecordData, Snapshot } from '../model.ts';

export class BitECS extends Base {
  private readonly world = createWorld();
  private readonly data: (Payload | undefined)[] = [];
  private readonly active = {};
  private readonly handles: number[] = [];
  private hot: {
    work: Float64Array | number[];
    charge: Float64Array | number[];
    quantity: Float64Array | number[];
  };
  public constructor(
    fixture: Fixture,
    snapshot?: Snapshot,
    private readonly arrays = false,
  ) {
    super(fixture, snapshot);
    const allocate = (): Float64Array | number[] =>
      arrays ? [] : new Float64Array(Math.max(2048, fixture.size * 2));
    this.hot = { work: allocate(), charge: allocate(), quantity: allocate() };
    this.initialize(snapshot);
  }
  private capacity(id: number): void {
    if (this.arrays || id < this.hot.work.length) return;
    for (const key of ['work', 'charge', 'quantity'] as const) {
      const next = new Float64Array(Math.max(id + 1, this.hot[key].length * 2));
      next.set(this.hot[key]);
      this.hot[key] = next;
    }
  }
  protected insert(record: RecordData): void {
    const eid = addEntity(this.world);
    this.capacity(eid);
    addComponent(this.world, eid, this.data);
    addComponent(this.world, eid, this.hot);
    this.data[eid] = record.payload;
    this.hot.work[eid] = record.work;
    this.hot.charge[eid] = record.charge;
    this.hot.quantity[eid] = record.quantity;
    this.handles[record.payload.ordinal] = eid;
    if (record.payload.kind === 'processor' && record.payload.status === 0)
      addComponent(this.world, eid, this.active);
  }
  protected remove(ordinal: number): void {
    const eid = this.handles[ordinal];
    removeEntity(this.world, eid);
    this.data[eid] = undefined;
    this.hot.work[eid] = this.hot.charge[eid] = this.hot.quantity[eid] = 0;
    delete this.handles[ordinal];
  }
  protected read(ordinal: number): RecordData {
    const eid = this.handles[ordinal];
    return {
      payload: this.data[eid]!,
      work: this.hot.work[eid],
      charge: this.hot.charge[eid],
      quantity: this.hot.quantity[eid],
    };
  }
  protected membership(ordinal: number, active: boolean): void {
    if (active) addComponent(this.world, this.handles[ordinal], this.active);
    else removeComponent(this.world, this.handles[ordinal], this.active);
  }
  protected quantity(ordinal: number, value: number): void {
    this.hot.quantity[this.handles[ordinal]] = value;
  }
  protected systems(): void {
    const { work, charge } = this.hot;
    for (const eid of query(this.world, [this.data, this.hot, this.active])) {
      const payload = this.data[eid]!;
      work[eid] = work[eid] <= 1 ? complete(payload, this.resources) : work[eid] - 1;
      charge[eid] = charge[eid] > 0 ? charge[eid] - 1 : 1200;
      this.mark(payload.ordinal);
    }
  }
  public override probe(): void {
    super.probe();
    const outer = query(this.world, [this.data]);
    const n = outer.length;
    query(this.world, [this.active], isNested);
    if (outer.length !== n) throw new Error('Nested query invalidated outer iteration');
    commitRemovals(this.world);
    if (!entityExists(this.world, this.handles[0])) throw new Error('Live handle lost');
  }
  protected shutdown(): void {
    deleteWorld(this.world);
    this.handles.length = this.data.length = 0;
    this.hot = { work: [], charge: [], quantity: [] };
  }
}
