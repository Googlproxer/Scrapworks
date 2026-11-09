import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { SaveSnapshot } from '../../src/contracts/save.ts';

export async function readManualSave(page: Page): Promise<SaveSnapshot | undefined> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ScrapworksGameplaySaves');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<SaveSnapshot | undefined>((resolve, reject) => {
        const tx = db.transaction('slots', 'readonly'),
          r = tx.objectStore('slots').get('manual-1');
        tx.oncomplete = () => resolve(r.result?.payload as SaveSnapshot | undefined);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

/** A prior success message may remain visible while another save is queued. Observe its commit. */
export async function saveThroughUi(page: Page): Promise<SaveSnapshot> {
  const previous = (await readManualSave(page))?.token;
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await page.waitForFunction(
    async (token) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('ScrapworksGameplaySaves');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        return await new Promise<boolean>((resolve, reject) => {
          const tx = db.transaction('slots', 'readonly'),
            r = tx.objectStore('slots').get('manual-1');
          tx.oncomplete = () =>
            resolve(!!r.result?.payload?.token && r.result.payload.token !== token);
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    previous,
    { timeout: 30000, polling: 50 },
  );
  const saved = await readManualSave(page);
  assert(saved);
  return saved;
}
