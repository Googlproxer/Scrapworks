import { Base } from '../base.ts';
import { complete } from '../model.ts';
import type { Fixture, RecordData, Snapshot } from '../model.ts';

export class Reference extends Base {
  private readonly records: RecordData[] = [];
  public constructor(fixture: Fixture, snapshot?: Snapshot) {
    super(fixture, snapshot);
    this.initialize(snapshot);
  }
  protected insert(record: RecordData): void {
    this.records[record.payload.ordinal] = record;
  }
  protected remove(ordinal: number): void {
    delete this.records[ordinal];
  }
  protected read(ordinal: number): RecordData {
    return this.records[ordinal];
  }
  protected quantity(ordinal: number, value: number): void {
    this.records[ordinal].quantity = value;
  }
  protected membership(): void {
    /* Oracle derives membership from current data. */
  }
  protected systems(): void {
    for (const record of this.records) {
      if (record.payload.kind !== 'processor' || record.payload.status !== 0) continue;
      record.work = record.work <= 1 ? complete(record.payload, this.resources) : record.work - 1;
      record.charge = record.charge > 0 ? record.charge - 1 : 1200;
      this.mark(record.payload.ordinal);
    }
  }
  protected shutdown(): void {
    this.records.length = 0;
  }
}
