// Independent, untimed wire-schema assertions; expected columns do not reuse the encoder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Reference } from '../../../../tools/ecs-bench/adapters/reference.ts';
import {
  publishLean,
  PresentationCache,
  stride,
} from '../../../../tools/simulation-worker-bench/presentation.ts';

const candidate = process.argv[2];
if (!candidate) {
  const results = ['reference', 'miniplex', 'bitecs'].map((name) => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-transform-types', import.meta.filename, name],
      { encoding: 'utf8', windowsHide: true },
    );
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  });
  fs.writeFileSync(
    path.join(import.meta.dirname, 'schema-checks.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} else {
  const fixture = { size: 1000, seed: 1729, workload: 'mixed' };
  const source = new Reference(fixture);
  const snapshot = source.capture();
  source.dispose();
  const record = snapshot.records[0];
  record.payload.id = 'entity-0-7';
  record.payload.generation = 7;
  record.payload.position = { x: 1.2345678901234567, z: -9.87654321098765 };
  record.work = 17.1234567891234;
  record.charge = 543.234567890123;
  record.quantity = 9.125;
  record.payload.reserved = 333.143;
  record.payload.held = 444.314;
  const Factory =
    candidate === 'reference'
      ? Reference
      : Object.values(await import(`../../../../tools/ecs-bench/adapters/${candidate}.ts`))[0];
  const world = new Factory(fixture, snapshot);
  const frame = publishLean(world, new Set(['entity-0-7']), 1, true);
  const rows = new Float64Array(frame.rows);
  assert.deepEqual(
    Array.from(rows.subarray(0, stride)),
    [
      0, 7, 0, 1.2345678901234567, -9.87654321098765, 0, 17.1234567891234, 543.234567890123, 9.125,
      333.143, 444.314, 0,
    ],
  );
  assert.deepEqual(
    [rows[2], rows[6 * stride + 2], rows[8 * stride + 2], rows[9 * stride + 2]],
    [0, 1, 2, 3],
  );
  assert.equal(frame.details[0].payload.id, 'entity-0-7');
  const cache = new PresentationCache(1000);
  cache.apply(frame);
  world.step();
  cache.apply(publishLean(world, new Set(['entity-0-7']), 2));
  assert.equal(cache.values[3], 1.2345678901234567);
  assert.equal(cache.values[4], -9.87654321098765);
  assert.equal(cache.values[6], 17.1234567891234 - 1);
  assert.equal(cache.values[7], 543.234567890123 - 1);
  assert.equal(cache.values[11], 1);
  assert.equal(cache.details.get('entity-0-7').work, 17.1234567891234 - 1);
  world.dispose();
  console.log(
    JSON.stringify({
      candidate,
      pass: true,
      checks:
        'Independent field order, all kinds, asymmetric fractional coordinates/values, generation, next-tick work/charge/stamp and subscribed details',
    }),
  );
}
