import { createQuery, createWorld, getStore, trait } from 'koota';
import type { Entity, ExtractStore } from 'koota';
import { Base } from '../base.ts';
import { complete } from '../model.ts';
import type { Fixture, Payload, RecordData, Snapshot } from '../model.ts';

// Definitions are shared across worlds; each world's stores remain independent.
const Data = trait(() => ({ value: null as Payload | null }));
const Hot = trait({ work: 0, charge: 0, quantity: 0 });
const Active = trait();
const activeQuery = createQuery(Data, Hot, Active);
export class Koota extends Base {
  private readonly world = createWorld();
  private readonly handles: Entity[] = [];
  private data?: ExtractStore<typeof Data>;
  private hot?: ExtractStore<typeof Hot>;
  public constructor(
    fixture: Fixture,
    snapshot?: Snapshot,
    private readonly update = false,
  ) {
    super(fixture, snapshot);
    this.initialize(snapshot);
  }
  protected insert(record: RecordData): void {
    const entity = this.world.spawn(
      Data({ value: record.payload }),
      Hot({ work: record.work, charge: record.charge, quantity: record.quantity }),
    );
    if (!this.data) {
      this.data = getStore(this.world, Data);
      this.hot = getStore(this.world, Hot);
    }
    this.handles[record.payload.ordinal] = entity;
    if (record.payload.kind === 'processor' && record.payload.status === 0) entity.add(Active);
  }
  protected remove(ordinal: number): void {
    this.handles[ordinal].destroy();
    delete this.handles[ordinal];
  }
  protected read(ordinal: number): RecordData {
    const eid = this.handles[ordinal].id();
    return {
      payload: this.data![eid].value!,
      work: this.hot!.work[eid],
      charge: this.hot!.charge[eid],
      quantity: this.hot!.quantity[eid],
    };
  }
  protected membership(ordinal: number, active: boolean): void {
    if (active) this.handles[ordinal].add(Active);
    else this.handles[ordinal].remove(Active);
  }
  protected quantity(ordinal: number, value: number): void {
    this.handles[ordinal].set(Hot, { quantity: value });
  }
  protected override mark(ordinal: number): void {
    this.handles[ordinal].changed(Data);
    super.mark(ordinal);
  }
  protected systems(): void {
    const result = this.world.query(activeQuery);
    if (this.update) {
      result.updateEach(([data, hot]) => {
        const payload = data.value!;
        hot.work = hot.work <= 1 ? complete(payload, this.resources) : hot.work - 1;
        hot.charge = hot.charge > 0 ? hot.charge - 1 : 1200;
        this.mark(payload.ordinal);
      });
    } else {
      result.useStores(([data, hot], entities) => {
        for (const entity of entities) {
          const eid = entity.id();
          const payload = data[eid].value!;
          hot.work[eid] =
            hot.work[eid] <= 1 ? complete(payload, this.resources) : hot.work[eid] - 1;
          hot.charge[eid] = hot.charge[eid] > 0 ? hot.charge[eid] - 1 : 1200;
          entity.changed(Hot);
          this.mark(payload.ordinal);
        }
      });
    }
  }
  protected shutdown(): void {
    this.world.destroy();
    this.handles.length = 0;
    this.data = undefined;
    this.hot = undefined;
  }
}
