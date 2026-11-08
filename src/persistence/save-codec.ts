import { MANUAL_SLOT, type SaveMetadata, type SaveSnapshot } from '@contracts/save';
import { RAPIER_VERSION } from '@contracts/physics';
import { requireInvariant as check } from '@contracts/simulation';
import { OPENING_CONTENT } from '@content/opening';

export const MAX_SAVE_BYTES = 96 * 1024 * 1024;

/** Bounded plain-data gate on the host. Full gameplay/native validation runs in the candidate worker. */
export function decodeSave(input: unknown): SaveSnapshot {
  const pending = [input];
  const seen = new Set<object>();
  let size = 0;
  while (pending.length) {
    const value: unknown = pending.pop();
    if (typeof value === 'string') size += value.length * 2;
    else if (typeof value === 'number') {
      check(Number.isFinite(value), 'Save contains a nonfinite number.');
      size += 8;
    } else if (value && typeof value === 'object') {
      check(!seen.has(value), 'Save must contain detached, acyclic plain data.');
      seen.add(value);
      check(
        Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype,
        'Save must contain plain data.',
      );
      const values = Object.values(value);
      size += values.length * 8;
      check(
        size <= MAX_SAVE_BYTES && pending.length + values.length <= 1000000,
        'Save is too large.',
      );
      pending.push(...values.slice(0, 10000));
      // Avoid argument-count limits for native byte arrays.
      for (let i = 10000; i < values.length; i++) pending.push(values[i]);
    } else check(value === null || typeof value === 'boolean', 'Save contains unsupported data.');
    check(size <= MAX_SAVE_BYTES, 'Save is too large.');
  }
  check(!!input && typeof input === 'object' && !Array.isArray(input), 'Invalid save envelope.');
  const save = input as Partial<SaveSnapshot>;

  const id = (value: unknown) =>
    typeof value === 'string' && value.length > 0 && value.length <= 256;

  check(
    Object.keys(save).every((key) =>
      [
        'slot',
        'schema',
        'runId',
        'worldId',
        'contentVersion',
        'savedAt',
        'token',
        'tick',
        'world',
      ].includes(key),
    ),
    'Unknown save field.',
  );
  check(save.schema === 1 && save.slot === MANUAL_SLOT, 'Unsupported save schema or slot.');
  check(id(save.runId) && id(save.worldId) && id(save.token), 'Invalid save identity.');
  check(
    typeof save.savedAt === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(save.savedAt) &&
      Number.isFinite(Date.parse(save.savedAt)),
    'Invalid save date.',
  );
  check(Number.isSafeInteger(save.tick) && Number(save.tick) >= 0, 'Invalid save tick.');
  check(
    [OPENING_CONTENT.version, 'opening-1', 'research-1'].includes(save.contentVersion ?? '') &&
      save.world?.version === 3 &&
      save.world.contentVersion === save.contentVersion,
    'Unsupported save content or world version.',
  );
  check(
    save.world.resources?.worldId === save.worldId &&
      save.world.definition?.id === save.worldId &&
      save.world.resources.tick === save.tick,
    'Save metadata disagrees with its world.',
  );
  check(
    save.world.physics?.format === 3 &&
      save.world.physics.engine === 'rapier3d' &&
      save.world.physics.engineVersion === RAPIER_VERSION,
    'Unsupported save physics version.',
  );
  return structuredClone(save as SaveSnapshot);
}

export function saveMetadata(save: SaveMetadata): SaveMetadata {
  return {
    slot: save.slot,
    schema: save.schema,
    runId: save.runId,
    worldId: save.worldId,
    contentVersion: save.contentVersion,
    savedAt: save.savedAt,
    token: save.token,
    tick: save.tick,
  };
}

/** Metadata remains readable/deletable even when the stored world payload is damaged. */
export function decodeMetadata(value: unknown): SaveMetadata {
  check(!!value && typeof value === 'object', 'Invalid slot metadata.');
  const metadata = value as SaveMetadata;
  check(
    metadata.slot === MANUAL_SLOT &&
      metadata.schema === 1 &&
      [metadata.runId, metadata.worldId, metadata.contentVersion, metadata.token].every(
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 256,
      ) &&
      typeof metadata.savedAt === 'string' &&
      Number.isFinite(Date.parse(metadata.savedAt)) &&
      Number.isSafeInteger(metadata.tick) &&
      metadata.tick >= 0,
    'Invalid slot metadata.',
  );
  return saveMetadata(metadata);
}
