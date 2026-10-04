import { Service } from '@angular/core';
import { Dexie, EntityTable } from 'dexie';
import { TestData } from './schema';

interface DBSchema {
  testData: EntityTable<TestData, 'id'>;
}
type DBInstance = Dexie & DBSchema;

@Service()
export class SaveService {
  private db: DBInstance;

  public constructor() {
    this.db = new Dexie('GameSaveDatabase') as DBInstance;
    this.db.version(1).stores({
      testData: '++id, name, value',
    });
  }

  public save(testData: Omit<TestData, 'id'>) {
    //  save data to the database
    this.db.testData.put(testData);
  }

  public async load(id: number) {
    //  load data from the database
    const data = await this.db.testData.get(id);
    if (data) {
      console.log('Loaded data:', data);
    } else {
      console.log('No data found.');
    }
  }

  public async loadAll(): Promise<TestData[]> {
    //  load all data from the database
    const data = await this.db.testData.toArray();
    console.log('Loaded all data:', data);
    return data;
  }

  public async delete(id: number) {
    //  delete data from the database
    await this.db.testData.delete(id);
    console.log(`Deleted data with id: ${id}`);
  }

  public async clear() {
    //  clear all data from the database
    await this.db.testData.clear();
    console.log('Cleared all data.');
  }

  public async export(): Promise<string> {
    //  export data from the database, to be saved to a file or sent to a server
    const data = await this.db.testData.toArray();
    const jsonData = JSON.stringify(data);
    console.log('Exported data:', jsonData);
    return jsonData;
  }

  public async import(data: string) {
    //  import data into the database
    const testData = JSON.parse(data);
    await this.db.testData.bulkPut(testData);
  }
}
