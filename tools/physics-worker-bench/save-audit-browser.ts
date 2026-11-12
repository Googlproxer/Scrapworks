export {};
const status = document.getElementById('status')!;
document.getElementById('start')!.addEventListener('click', () => {
  (document.getElementById('start') as HTMLButtonElement).disabled = true;
  void (async () => {
    let exported = 0;
    for (const entry of await indexedDB.databases()) {
      if (!entry.name?.startsWith('ScrapworksPhysicsBench-')) continue;
      const name = entry.name;
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        if (!db.objectStoreNames.contains('payloads')) continue;
        const payloads = await new Promise<unknown[]>((resolve, reject) => { const transaction = db.transaction('payloads', 'readonly'), request = transaction.objectStore('payloads').getAll(); transaction.oncomplete = () => resolve(request.result as unknown[]); transaction.onerror = () => reject(transaction.error); });
        if (!payloads.length) continue;
        const response = await fetch('/capture/saved-' + encodeURIComponent(name.slice('ScrapworksPhysicsBench-'.length)), { method: 'POST', body: JSON.stringify({ database: name, payloads }) });
        if (!response.ok) throw new Error('Save evidence export failed');
        ++exported; status.textContent = `Exported ${exported} experiment save databases for native audit.`;
      } finally { db.close(); }
    }
    status.textContent = `Completed save evidence export: ${exported} experiment databases. User game storage was outside this origin.`;
  })().catch(error => { status.textContent = `Save export failed: ${String(error)}`; });
});
