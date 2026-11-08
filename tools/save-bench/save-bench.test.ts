import assert from 'node:assert/strict';
import { test } from 'vitest';
import { worldFixture } from '../../tests/support/world-fixture';
import { Simulation } from '../../src/simulation/ecs-runtime';
import { preparePlayerSave } from '../../src/simulation/player-save';
import { decodeSave } from '../../src/persistence/save-codec';
import { assertExact, formats } from './codecs';
import { fixture } from './fixtures';
import { distribution, shuffled } from './model';
import { parseOptions } from './options';
import { report } from './report';
import { BenchmarkStore } from './storage';

test('every format preserves native snapshots, optional components, jobs and deterministic continuation', async () => {
  for (const save of [
    fixture(worldFixture()),
    fixture(worldFixture(), 32),
    fixture(worldFixture(), undefined, 4),
  ]) {
    const original = structuredClone(save);
    const reference = new Simulation(save.world.definition, {
      snapshot: preparePlayerSave(save.world),
    });
    let expected;
    try {
      for (let i = 0; i < 4; i++) reference.step({ x: 0, z: 0, sprint: false });
      expected = reference.capture();
    } finally {
      reference.dispose();
    }
    for (const format of formats) {
      const encoded = await format.encode(save);
      // Mirrors the browser's storage boundary; no shared input object can conceal a broken round-trip.
      const decoded = await format.decode(structuredClone(encoded));
      assert.deepStrictEqual(decoded, original, format.id);
      assertExact(decoded, original);
      const loaded = decodeSave(decoded);
      const simulation = new Simulation(loaded.world.definition, {
        snapshot: preparePlayerSave(loaded.world),
      });
      try {
        for (let i = 0; i < 4; i++) simulation.step({ x: 0, z: 0, sprint: false });
        assert.deepStrictEqual(simulation.capture(), expected, format.id);
      } finally {
        simulation.dispose();
      }
      if (encoded instanceof Uint8Array)
        assert.equal(encoded.byteLength, encoded.buffer.byteLength);
    }
    assert.deepStrictEqual(save, original, 'Codec changed its input.');
  }
});

test('synthetic fixture totals include the base entities and retain active work', () => {
  const a = fixture(worldFixture(), 100),
    b = fixture(worldFixture(), 100);
  assert.deepStrictEqual(a, b);
  assert.equal(a.world.entities.length, 100);
  assert.equal(a.world.entities.filter((e) => e.kind === 'pile').length, 98);
  const opening = a.world.entities.find((e) => e.kind === 'player')!.opening!;
  assert(opening.handcraft);
  assert(opening.minifab.job);
  assert.throws(() => fixture(worldFixture(), 250001), /250000/);
  assert.throws(() => fixture(worldFixture(), 1), /base entities/);
});

test('fidelity guard rejects lost fields, quantities, physics bytes and signed zero', () => {
  const save = fixture(worldFixture(), 10);
  const changed = structuredClone(save);
  changed.world.entities.find((e) => e.pile)!.pile!.quantity++;
  assert.throws(() => assertExact(changed, save), /mismatch/);
  assert.throws(() => assertExact({ a: 0 }, { a: -0 }), /mismatch/);
  assert.throws(() => assertExact({ a: undefined }, {}), /mismatch/);
  assert.throws(() => assertExact([,], []), /length/);
  const physics = structuredClone(save);
  physics.world.physics = { ...physics.world.physics, bytes: [0] };
  assert.throws(() => assertExact(physics, save), /mismatch/);
  assertExact({ b: [1, null], a: 'same' }, { a: 'same', b: [1, null] });
});

test('malformed codec inputs fail before simulation restoration', async () => {
  await assert.rejects(
    async () => formats.find((f) => f.id === 'json')!.decode(new Uint8Array()),
    /JSON text/,
  );
  await assert.rejects(async () =>
    formats.find((f) => f.id === 'json-gzip')!.decode(new Uint8Array([1, 2, 3])),
  );
  await assert.rejects(
    async () => formats.find((f) => f.id === 'compact-msgpack')!.decode(new Uint8Array([0xc0])),
    /schema/,
  );
  await assert.rejects(
    async () =>
      formats.find((f) => f.id === 'binary-physics')!.decode({ world: { physics: { bytes: [] } } }),
    /binary physics/,
  );
  assert.throws(() => new BenchmarkStore('ScrapworksGameplaySaves'), /prefix/);
});

test('CLI defaults use the requested scales and reject misleading configurations', () => {
  assert.deepEqual(parseOptions([]).populations, [10000, 100000, 250000]);
  assert.equal(parseOptions(['--smoke']).samples, 3);
  assert.equal(parseOptions(['--warmups', '0']).warmups, 0);
  for (const args of [
    ['--samples', '0'],
    ['--samples', 'NaN'],
    ['--samples'],
    ['--samples', '2', '--samples', '3'],
    ['--populations', '10,10'],
    ['--populations', '250001'],
    ['--physics-bodies', '-1'],
    ['--unknown'],
  ])
    assert.throws(() => parseOptions(args));
});

test('statistics preserve raw data and use documented nearest-rank percentiles', () => {
  const values = [10, 1, 5, 3];
  assert.deepEqual(distribution(values), { count: 4, min: 1, p50: 3, p95: 10, max: 10 });
  assert.deepEqual(values, [10, 1, 5, 3]);
  assert.throws(() => distribution([]));
  assert.throws(() => distribution([Infinity]));
  assert.deepEqual(shuffled(formats, 12), shuffled(formats, 12));
  assert.equal(new Set(shuffled(formats, 12)).size, formats.length);
});

test('report exposes rejected production gates instead of inventing full-pipeline numbers', () => {
  const text = report([
    {
      name: 'gated',
      synthetic: true,
      population: 250000,
      kinds: { pile: 250000 },
      physicsBytes: 12,
      jsonUtf8Bytes: 99,
      sha256: 'fixture-hash',
      hostGate: { accepted: false, error: 'Save is too large.' },
      common: { captureMs: [10], validateAndCloneMs: [20], cloneOnlyMs: [3] },
      order: [['json']],
      formats: [
        {
          format: 'json',
          label: 'JSON',
          wireBytes: 99,
          storage: { beforeBytes: 0, afterBytes: 100, deltaBytes: 100, source: 'test' },
          correctness: { exactRoundTrip: true, continuedTicks: 4 },
          stages: [{ encodeMs: 1, writeMs: 2, readMs: 3, decodeMs: 4 }],
          pipeline: null,
        },
      ],
    },
  ]);
  assert.match(text, /rejected/);
  assert.match(text, /blocked/);
  assert.match(text, /No limits were raised/);
  assert.match(text, /not exact disk-file sizes/);
  assert.match(text, /fixture-hash/);
});
