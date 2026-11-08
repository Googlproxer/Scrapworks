import { encode, decode } from '@msgpack/msgpack';
import type { SaveSnapshot } from '../../src/contracts/save';
import { saveMetadata } from '../../src/persistence/save-codec';
import type { EntityData, TransformData } from '../../src/contracts/simulation';

export interface SaveFormat {
  readonly id: string;
  readonly label: string;
  encode(save: SaveSnapshot): unknown | Promise<unknown>;
  decode(payload: unknown): SaveSnapshot | Promise<SaveSnapshot>;
  /** Portable payload bytes, not IndexedDB's private structured-clone encoding. */
  wireBytes(payload: unknown): number | null;
}

type BinarySave = Omit<SaveSnapshot, 'world'> & {
  world: Omit<SaveSnapshot['world'], 'physics'> & {
    physics: Omit<SaveSnapshot['world']['physics'], 'bytes'> & { bytes: Uint8Array };
  };
};

function binaryPhysics(save: SaveSnapshot): BinarySave {
  return {
    ...save,
    world: {
      ...save.world,
      physics: { ...save.world.physics, bytes: Uint8Array.from(save.world.physics.bytes) },
    },
  };
}

function plainPhysics(save: BinarySave): SaveSnapshot {
  if (!(save.world?.physics?.bytes instanceof Uint8Array))
    throw new Error('Missing binary physics.');
  return {
    ...save,
    world: {
      ...save.world,
      physics: { ...save.world.physics, bytes: Array.from(save.world.physics.bytes) },
    },
  };
}

// Benchmark schema 1: fixed component positions, a presence mask, packed transforms and native bytes.
// Float64 values and all components survive exactly; this is not a production save schema.
const components = [
  'id',
  'kind',
  'transform',
  'inventory',
  'equipment',
  'deposit',
  'pile',
  'building',
  'opening',
  'physics',
] as const;

function packTransform(t: TransformData): unknown[] {
  return [
    t.position.x,
    t.position.y,
    t.position.z,
    t.facing,
    t.moving,
    t.sprinting,
    ...(t.rotation ? [t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w] : []),
  ];
}

function unpackTransform(row: unknown[]): TransformData {
  if (row.length !== 6 && row.length !== 10) throw new Error('Invalid compact transform.');
  const t: TransformData = {
    position: { x: row[0] as number, y: row[1] as number, z: row[2] as number },
    facing: row[3] as number,
    moving: row[4] as boolean,
    sprinting: row[5] as boolean,
  };
  if (row.length === 10)
    t.rotation = {
      x: row[6] as number,
      y: row[7] as number,
      z: row[8] as number,
      w: row[9] as number,
    };
  return t;
}

function packEntity(entity: EntityData): unknown[] {
  let mask = 0;
  const values: unknown[] = [];
  for (const [i, key] of components.entries()) {
    if (!Object.hasOwn(entity, key)) continue;
    mask |= 1 << i;
    values.push(key === 'transform' ? packTransform(entity.transform!) : entity[key]);
  }
  return [mask, ...values];
}

function unpackEntity(row: unknown[]): EntityData {
  const mask = row[0];
  if (!Number.isInteger(mask) || Number(mask) < 0 || Number(mask) >= 1 << components.length)
    throw new Error('Invalid compact component mask.');
  const result: Record<string, unknown> = {};
  let offset = 1;
  for (const [i, key] of components.entries())
    if (Number(mask) & (1 << i)) {
      if (offset >= row.length) throw new Error('Missing compact component.');
      const value = row[offset++];
      result[key] = key === 'transform' ? unpackTransform(value as unknown[]) : value;
    }
  if (offset !== row.length) throw new Error('Unexpected compact component.');
  return result as unknown as EntityData;
}

function compact(save: SaveSnapshot): unknown[] {
  const { bytes, ...physics } = save.world.physics;
  return [
    'scrapworks-save-bench-1',
    saveMetadata(save),
    save.world.version,
    save.world.contentVersion,
    save.world.definition,
    save.world.resources,
    physics,
    Uint8Array.from(bytes),
    save.world.entities.map(packEntity),
  ];
}

function expand(payload: unknown): SaveSnapshot {
  if (!Array.isArray(payload) || payload.length !== 9 || payload[0] !== 'scrapworks-save-bench-1')
    throw new Error('Invalid compact benchmark schema.');
  if (!(payload[7] instanceof Uint8Array) || !Array.isArray(payload[8]))
    throw new Error('Invalid compact physics or entities.');
  return {
    ...(payload[1] as SaveSnapshot),
    world: {
      version: payload[2],
      contentVersion: payload[3],
      definition: payload[4],
      resources: payload[5],
      physics: { ...payload[6], bytes: Array.from(payload[7]) },
      entities: (payload[8] as unknown[][]).map(unpackEntity),
    },
  };
}

function bytes(payload: unknown): Uint8Array<ArrayBuffer> {
  if (!(payload instanceof Uint8Array)) throw new Error('Expected encoded bytes.');
  return payload as Uint8Array<ArrayBuffer>;
}

async function compress(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const input = new Blob([text]).stream();
  return new Uint8Array(
    await new Response(input.pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
  );
}

async function decompress(payload: unknown): Promise<string> {
  const input = new Blob([bytes(payload)]).stream();
  return new Response(input.pipeThrough(new DecompressionStream('gzip'))).text();
}

export const formats: readonly SaveFormat[] = [
  {
    id: 'current-object',
    label: 'Current object / production repository',
    encode: (save) => save,
    decode: (payload) => payload as SaveSnapshot,
    wireBytes: () => null,
  },
  {
    id: 'json',
    label: 'JSON string',
    encode: (save) => JSON.stringify(save),
    decode: (payload) => {
      if (typeof payload !== 'string') throw new Error('Expected JSON text.');
      return JSON.parse(payload) as SaveSnapshot;
    },
    wireBytes: (payload) => new TextEncoder().encode(payload as string).byteLength,
  },
  {
    id: 'json-gzip',
    label: 'JSON + browser gzip',
    encode: (save) => compress(JSON.stringify(save)),
    decode: async (payload) => JSON.parse(await decompress(payload)) as SaveSnapshot,
    wireBytes: (payload) => bytes(payload).byteLength,
  },
  {
    id: 'msgpack',
    label: 'MessagePack / unchanged object layout',
    // Own a tight buffer: IndexedDB clones the backing ArrayBuffer, including unused encoder capacity.
    encode: (save) => encode(save).slice(),
    decode: (payload) => decode(bytes(payload)) as SaveSnapshot,
    wireBytes: (payload) => bytes(payload).byteLength,
  },
  {
    id: 'binary-physics',
    label: 'Object + Uint8Array physics',
    encode: binaryPhysics,
    decode: (payload) => plainPhysics(payload as BinarySave),
    wireBytes: () => null,
  },
  {
    id: 'compact-msgpack',
    label: 'Compact components + binary physics / MessagePack',
    encode: (save) => encode(compact(save)).slice(),
    decode: (payload) => expand(decode(bytes(payload))),
    wireBytes: (payload) => bytes(payload).byteLength,
  },
];

/** Exact data comparison, including signed zero, missing keys and every native physics byte. */
export function assertExact(actual: unknown, expected: unknown): void {
  const pending: [unknown, unknown][] = [[actual, expected]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (Object.is(a, b)) continue;
    if (
      !a ||
      !b ||
      typeof a !== 'object' ||
      typeof b !== 'object' ||
      Array.isArray(a) !== Array.isArray(b)
    )
      throw new Error('Save round-trip data mismatch.');
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length)
      throw new Error('Save round-trip array length mismatch.');
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) throw new Error('Save round-trip key mismatch.');
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) throw new Error(`Save round-trip missing key: ${key}`);
      if (!Object.is(left[key], right[key])) pending.push([left[key], right[key]]);
    }
  }
}
