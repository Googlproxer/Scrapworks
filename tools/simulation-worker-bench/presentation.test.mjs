import test from 'node:test';
import assert from 'node:assert/strict';
import { Reference } from '../ecs-bench/adapters/reference.ts';
import { defaultDetails, PresentationCache, publishLean, stride } from './presentation.ts';
import { validDetails } from './protocol.ts';

test('transferred presentation is detached, precise, complete and independent of ECS storage', () => {
  const world = new Reference({ size: 1000, seed: 1729, workload: 'mixed' });
  const watched = new Set(defaultDetails);
  const cache = new PresentationCache(1000);
  const initial = publishLean(world, watched, 1, true);
  const wire = structuredClone(initial, { transfer: [initial.rows, initial.removed] });
  assert.equal(initial.rows.byteLength, 0);
  assert.equal(wire.rows.byteLength, 1000 * stride * 8);
  cache.apply(wire);
  cache.verify(world.capture().records, defaultDetails);
  cache.values[3] = -1;
  cache.details.get('entity-6-0').payload.slots[0].quantity = -1;
  assert.equal(world.capture().records[0].payload.position.x, 0);
  assert.equal(world.capture().records[6].payload.slots[0].quantity, 50);
  world.step();
  cache.apply(publishLean(world, watched, 2, true));
  cache.verify(world.capture().records, defaultDetails);
  world.dispose();
});

test('replacement identities and malformed packets preserve completed presentations', () => {
  const world = new Reference({ size: 1000, seed: 1729, workload: 'churn' });
  const cache = new PresentationCache(1000);
  cache.apply(publishLean(world, new Set(), 1, true));
  for (let version = 2; version < 125; version++) {
    world.step();
    cache.apply(publishLean(world, new Set(), version));
    cache.verify(world.capture().records, []);
  }
  const saved = new Float64Array(cache.values);
  const frame = publishLean(world, new Set(), 125, true);
  new Float64Array(frame.rows)[stride] = 1001;
  assert.throws(() => cache.apply(frame), /identity/);
  assert.deepEqual(cache.values, saved);
  const empty = publishLean(world, new Set(), 126);
  cache.apply({ ...empty, removed: new Float64Array([0, 0]).buffer });
  cache.verify(world.capture().records, []);
  world.step();
  cache.apply(publishLean(world, new Set(), 127, true));
  cache.verify(world.capture().records, []);
  world.dispose();
});

test('detail subscriptions are bounded and identity validated', () => {
  validDetails(defaultDetails);
  assert.throws(
    () => validDetails(Array.from({ length: 17 }, (_, i) => `entity-${i}-0`)),
    /bounded/,
  );
  assert.throws(() => validDetails(['entity-0-0', 'entity-0-0']), /unique/);
  assert.throws(() => validDetails(['entity-0-0-extra']), /identity/);
});

test('full publication grows host storage without dropping existing or new entities', () => {
  const world = new Reference({ size: 1000, seed: 1729, workload: 'mixed' });
  const cache = new PresentationCache(1000);
  cache.apply(publishLean(world, new Set(), 1, true));
  world.grow(10000);
  assert.throws(() => cache.apply(publishLean(world, new Set(), 2)), /schema\/size/);
  cache.apply(publishLean(world, new Set(), 3, true));
  cache.verify(world.capture().records, []);
  assert.equal(cache.size, 10000);
  world.dispose();
});
