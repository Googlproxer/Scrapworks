import { World } from 'miniplex';
import { Base } from '../base.ts';
import { complete } from '../model.ts';
import type { Fixture, RecordData, Snapshot } from '../model.ts';
type Entity = RecordData & { active?: true };

export class Miniplex extends Base {
  private readonly world = new World<Entity>();
  private readonly handles: Entity[] = [];
  private readonly active = this.world.with('active');
  public constructor(fixture: Fixture, snapshot?: Snapshot) {
    super(fixture, snapshot);
    this.initialize(snapshot);
  }
  protected insert(record: RecordData): void {
    const entity: Entity = record;
    if (record.payload.kind === 'processor' && record.payload.status === 0) entity.active = true;
    this.handles[record.payload.ordinal] = this.world.add(entity);
  }
  protected remove(ordinal: number): void {
    this.world.remove(this.handles[ordinal]);
    delete this.handles[ordinal];
  }
  protected read(ordinal: number): RecordData {
    const { payload, work, charge, quantity } = this.handles[ordinal];
    return { payload, work, charge, quantity };
  }
  protected quantity(ordinal: number, value: number): void {
    this.handles[ordinal].quantity = value;
  }
  protected membership(ordinal: number, active: boolean): void {
    if (active) this.world.addComponent(this.handles[ordinal], 'active', true);
    else this.world.removeComponent(this.handles[ordinal], 'active');
  }
  protected systems(): void {
    for (const record of this.active) {
      record.work = record.work <= 1 ? complete(record.payload, this.resources) : record.work - 1;
      record.charge = record.charge > 0 ? record.charge - 1 : 1200;
      this.mark(record.payload.ordinal);
    }
  }
  public override probe(): void {
    super.probe();
    const query = this.world.where((e) => e.payload.kind === 'processor' && e.payload.status === 0);
    const entity = this.handles[0];
    const count = [...query].length;
    entity.payload.status = 1;
    this.world.reindex(entity);
    if ([...query].length !== count - 1) throw new Error('Predicate removal was not reindexed');
    entity.payload.status = 0;
    this.world.reindex(entity);
    if ([...query].length !== count) throw new Error('Predicate addition was not reindexed');
    query.disconnect();
  }
  protected shutdown(): void {
    this.world.clear();
    this.handles.length = 0;
  }
}
