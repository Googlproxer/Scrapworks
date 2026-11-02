import { DestroyRef, inject, Service } from '@angular/core';
import { Dexie, type EntityTable } from 'dexie';
import { assertTestData, type TestData } from './schema';

interface DBSchema {
  testData: EntityTable<TestData, 'id'>;
}

type DBInstance = Dexie & DBSchema;

/** Isolated developer records. Milestone 4 introduces gameplay persistence separately. */
@Service()
export class SaveService {
  private readonly db = new Dexie('GameSaveDatabase') as DBInstance;
  private pending = 0;
  private destroyed = false;

  public constructor() {
    this.db.version(1).stores({ testData: '++id, name, value' });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (!this.pending) this.db.close();
    });
  }

  private async access<T>(operation: () => PromiseLike<T>): Promise<T> {
    if (this.destroyed) throw new Error('Developer save utility is closed.');
    this.pending++;
    try {
      return await operation();
    } finally {
      if (--this.pending === 0 && this.destroyed) this.db.close();
    }
  }

  public save(data: TestData): Promise<number> {
    assertTestData(data);
    return this.access(() => this.db.testData.put(data));
  }

  public load(id: number): Promise<TestData | undefined> {
    return this.access(() => this.db.testData.get(id));
  }

  public loadAll(): Promise<TestData[]> {
    return this.access(() => this.db.testData.toArray());
  }

  public delete(id: number): Promise<void> {
    return this.access(() => this.db.testData.delete(id));
  }

  public clear(): Promise<void> {
    return this.access(() => this.db.testData.clear());
  }

  public async export(): Promise<string> {
    return JSON.stringify(await this.loadAll());
  }

  public async import(data: string): Promise<void> {
    const values: unknown = JSON.parse(data);
    if (!Array.isArray(values) || values.length > 10000)
      throw new Error('Expected an array of developer test records.');
    for (const value of values) assertTestData(value);
    if (new Set(values.map((value: TestData) => value.id)).size !== values.length)
      throw new Error('Duplicate developer record ID.');
    await this.access(() =>
      this.db.transaction('rw', this.db.testData, () =>
        this.db.testData.bulkPut(values as TestData[]),
      ),
    );
  }
}
