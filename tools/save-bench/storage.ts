import { Dexie, type Table } from 'dexie';
import type { SaveMetadata } from '../../src/contracts/save';
import { decodeMetadata } from '../../src/persistence/save-codec';

interface Row {
  slot: string;
  metadata: SaveMetadata;
  payload: unknown;
}

const MANUAL_SLOT = 'benchmark-single-row';
/** Isolated single-row codec control. Production M9 revision retention is measured separately. */
export class BenchmarkStore {
  private readonly db: Dexie;
  private readonly slots: Table<Row, string>;

  constructor(readonly name: string) {
    if (!name.startsWith('ScrapworksSaveBench-'))
      throw new Error('Benchmark database prefix required.');
    this.db = new Dexie(name);
    this.db.version(1).stores({ slots: '&slot' });
    this.slots = this.db.table('slots');
  }

  async open(): Promise<void> {
    await this.db.open();
  }

  async write(metadata: SaveMetadata, payload: unknown): Promise<void> {
    await this.db.transaction('rw', this.slots, async () => {
      const previous = await this.slots.get(MANUAL_SLOT);
      if (previous && decodeMetadata(previous.metadata).token !== metadata.token)
        throw new Error('Unexpected benchmark save token.');
      await this.slots.put({ slot: MANUAL_SLOT, metadata, payload });
    });
  }

  async read(): Promise<Row> {
    const row = await this.db.transaction('r', this.slots, () => this.slots.get(MANUAL_SLOT));
    if (!row) throw new Error('Missing benchmark record.');
    return row;
  }

  async delete(): Promise<void> {
    this.db.close();
    await Dexie.delete(this.name);
  }
}

export async function storageUsage(): Promise<{ bytes: number; source: string }> {
  const estimate = (await navigator.storage.estimate()) as StorageEstimate & {
    usageDetails?: { indexedDB?: number };
  };
  if (typeof estimate.usageDetails?.indexedDB === 'number')
    return {
      bytes: estimate.usageDetails.indexedDB,
      source: 'StorageManager.estimate usageDetails.indexedDB',
    };
  if (typeof estimate.usage !== 'number') throw new Error('Browser did not expose storage usage.');
  return { bytes: estimate.usage, source: 'StorageManager.estimate origin usage' };
}
