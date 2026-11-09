import { SAVE_SCHEMA, type SaveKind, type SaveMetadata, type SaveSnapshot } from '@contracts/save';
import type { SimulationSnapshot } from '@contracts/simulation';
import { RAPIER_VERSION } from '@contracts/physics';
import { requireInvariant as check } from '@contracts/simulation';
import { OPENING_CONTENT } from '@content/opening';
import { authoredMapKey } from '@core/authored-map';
import { migrateEnvelope } from './save-migrations';

export const MAX_SAVE_BYTES = 96 * 1024 * 1024;

const metadataKeys = [
  'schema',
  'slot',
  'runId',
  'name',
  'kind',
  'sequence',
  'previousToken',
  'recoveredFrom',
  'origin',
  'worldId',
  'mapKey',
  'contentVersion',
  'physicsVersion',
  'savedAt',
  'token',
  'tick',
] as const;

/** Bounded plain-data walk before cloning, migration or native reconstruction. */
export function assertSaveData(input: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }];
  const seen = new Set<object>();
  let size = 0,
    entries = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    check(depth <= 128 && ++entries <= 1000000, 'Save structure is too large or deeply nested.');
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
      const keys = Object.keys(value);
      check(keys.length + entries + pending.length <= 1000000, 'Save structure is too large.');
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        check('value' in descriptor, 'Save must not contain accessors.');
        size += key.length * 2 + 8;
        pending.push({ value: descriptor.value, depth: depth + 1 });
      }
    } else check(value === null || typeof value === 'boolean', 'Save contains unsupported data.');
    check(size <= MAX_SAVE_BYTES, 'Save is too large.');
  }
}

const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

const nullableId = (value: unknown) => value === null || id(value);

export function saveSlot(runId: string, kind: SaveKind): string {
  return `${runId}/${kind}`;
}

export function saveMetadata(save: SaveMetadata): SaveMetadata {
  return Object.fromEntries(metadataKeys.map((key) => [key, save[key]])) as unknown as SaveMetadata;
}

/** Metadata validation never reads a payload, so damaged heads remain recoverable/deletable. */
export function decodeMetadata(value: unknown): SaveMetadata {
  check(
    !!value && typeof value === 'object' && !Array.isArray(value),
    'Invalid revision metadata.',
  );
  const m = value as SaveMetadata;
  check(
    m.schema === SAVE_SCHEMA,
    'Unsupported save format. Compatibility starts with Milestone 9.',
  );
  check(
    [m.runId, m.worldId, m.token, m.contentVersion, m.physicsVersion].every(id),
    'Invalid save identity.',
  );
  check(m.kind === 'manual' || m.kind === 'auto', 'Invalid save kind.');
  check(m.slot === saveSlot(m.runId, m.kind), 'Invalid save slot.');
  check(
    typeof m.name === 'string' && m.name.trim().length > 0 && m.name.length <= 80,
    'Run name must contain 1–80 characters.',
  );
  check(
    Number.isSafeInteger(m.sequence) &&
      m.sequence > 0 &&
      Number.isSafeInteger(m.tick) &&
      m.tick >= 0,
    'Invalid revision sequence or tick.',
  );
  check(
    nullableId(m.previousToken) && nullableId(m.recoveredFrom) && m.previousToken !== m.token,
    'Invalid revision provenance.',
  );
  check(
    m.origin === null ||
      (!!m.origin &&
        typeof m.origin === 'object' &&
        id(m.origin.runId) &&
        id(m.origin.token) &&
        Object.keys(m.origin).every((k) => ['runId', 'token'].includes(k))),
    'Invalid import provenance.',
  );
  check(
    typeof m.savedAt === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.savedAt) &&
      Number.isFinite(Date.parse(m.savedAt)),
    'Invalid save date.',
  );
  check(
    typeof m.mapKey === 'string' && m.mapKey.length > 0 && m.mapKey.length <= MAX_SAVE_BYTES / 2,
    'Invalid authored-map identity.',
  );
  return structuredClone(saveMetadata(m));
}

/** Host gate. Full gameplay and native validation also runs in an isolated worker. */
export function decodeSave(input: unknown): SaveSnapshot {
  assertSaveData(input);
  const save = migrateEnvelope(input) as SaveSnapshot;
  check(
    Object.keys(save).every(
      (key) => key === 'world' || (metadataKeys as readonly string[]).includes(key),
    ),
    'Unknown save field.',
  );
  const m = decodeMetadata(save);
  check(
    save.world?.version === 3 &&
      save.world.contentVersion === m.contentVersion &&
      [OPENING_CONTENT.version, 'opening-1', 'research-1', 'factory-1'].includes(m.contentVersion),
    'Unsupported save content or world version.',
  );
  check(
    save.world.resources?.worldId === m.worldId &&
      save.world.definition?.id === m.worldId &&
      save.world.resources.tick === m.tick,
    'Save metadata disagrees with its world.',
  );
  check(
    authoredMapKey(save.world.definition) === m.mapKey,
    'Save authored-map metadata disagrees with its world.',
  );
  check(
    save.world.physics?.format === 3 &&
      save.world.physics.engine === 'rapier3d' &&
      save.world.physics.engineVersion === RAPIER_VERSION &&
      m.physicsVersion === RAPIER_VERSION,
    'Unsupported save physics version.',
  );
  return { ...m, world: structuredClone(save.world) };
}

export function createSave(
  world: SimulationSnapshot,
  runId: string,
  token: string,
  savedAt: string,
  options: Partial<
    Pick<SaveMetadata, 'kind' | 'name' | 'sequence' | 'previousToken' | 'recoveredFrom' | 'origin'>
  > = {},
): SaveSnapshot {
  const kind = options.kind ?? 'manual';
  return decodeSave({
    schema: SAVE_SCHEMA,
    slot: saveSlot(runId, kind),
    runId,
    token,
    savedAt,
    name: options.name ?? 'Untitled run',
    kind,
    sequence: options.sequence ?? 1,
    previousToken: options.previousToken ?? null,
    recoveredFrom: options.recoveredFrom ?? null,
    origin: options.origin ?? null,
    worldId: world.resources.worldId,
    mapKey: authoredMapKey(world.definition),
    contentVersion: world.contentVersion,
    physicsVersion: RAPIER_VERSION,
    tick: world.resources.tick,
    world,
  });
}

export function parseBackup(text: string): SaveSnapshot {
  check(new TextEncoder().encode(text).byteLength <= MAX_SAVE_BYTES, 'Backup file is too large.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The backup is not valid JSON.');
  }
  return decodeSave(value);
}

export function backupFilename(save: SaveMetadata): string {
  const name = save.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) || 'run';
  return `scrapworks-${name}-${save.kind}-${save.savedAt.replace(/[:.]/g, '-')}.json`;
}
