import type { Page } from 'playwright';
import type { SaveMetadata, SaveSnapshot } from '../../src/contracts/save.ts';

export async function readSavedHistory(page: Page): Promise<SaveMetadata[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ScrapworksGameplaySaves');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<SaveMetadata[]>((resolve, reject) => {
        const tx = db.transaction('revisions', 'readonly'),
          r = tx.objectStore('revisions').getAll();
        tx.oncomplete = () => resolve(r.result as SaveMetadata[]);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

export async function readManualSave(
  page: Page,
  runId?: string,
): Promise<SaveSnapshot | undefined> {
  const revisions = (await readSavedHistory(page)).filter((m) => m.kind === 'manual');
  const selectedRun =
    runId ?? revisions.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]?.runId;
  // Sequence is authoritative within a run, including when a resumed virtual clock moves back.
  const selected = revisions
    .filter((m) => m.runId === selectedRun)
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (!selected) return undefined;
  return page.evaluate(async (token) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ScrapworksGameplaySaves');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<SaveSnapshot | undefined>((resolve, reject) => {
        const tx = db.transaction('payloads', 'readonly'),
          r = tx.objectStore('payloads').get(token);
        tx.oncomplete = () => resolve(r.result?.payload as SaveSnapshot | undefined);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, selected.token);
}

/** Isolated prepared-fixture insertion; never used by production or CI playthroughs. */
export async function seedSave(page: Page, save: unknown): Promise<void> {
  await page.evaluate(async (input) => {
    const payload = input as SaveSnapshot;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ScrapworksGameplaySaves');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['revisions', 'payloads', 'runs'], 'readwrite');
        const { world: _world, ...metadata } = payload;
        tx.objectStore('revisions').put(metadata);
        tx.objectStore('payloads').put({ token: payload.token, payload });
        tx.objectStore('runs').put({
          runId: payload.runId,
          token: payload.token,
          sequence: payload.sequence,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, save);
}

export async function corruptNewestSave(page: Page): Promise<void> {
  const newest = (await readSavedHistory(page)).sort(
    (a, b) => b.savedAt.localeCompare(a.savedAt) || b.sequence - a.sequence,
  )[0];
  if (!newest) throw new Error('No fixture revision to corrupt.');
  await page.evaluate(async (token) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('ScrapworksGameplaySaves');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('payloads', 'readwrite'),
          store = tx.objectStore('payloads'),
          r = store.get(token);
        r.onsuccess = () =>
          store.put({ ...r.result, payload: { ...r.result.payload, schema: 999 } });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, newest.token);
}

/** A prior success message may remain visible while another save is queued. Observe its commit. */
export async function saveThroughUi(page: Page): Promise<SaveSnapshot> {
  const previous = new Set((await readSavedHistory(page)).map((revision) => revision.token));
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    const committed = (await readSavedHistory(page)).find(
      (revision) => revision.kind === 'manual' && !previous.has(revision.token),
    );
    if (committed) {
      const saved = await readManualSave(page, committed.runId);
      if (saved) return saved;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    'Save did not commit a new IndexedDB token within 30 seconds: ' +
      (await page.locator('body').innerText()),
  );
}
