import assert from 'node:assert/strict';
import { test } from 'vitest';
import { worldFixture } from '../../tests/support/world-fixture';
import { assertSameAuthoredMap, authoredMapKey } from './authored-map';
import type { EditableData } from '../contracts/readonly-data';

test('authored map compatibility ignores object key order and rejects changed data even with the same world ID', () => {
  const original = worldFixture();
  const reordered = Object.fromEntries(
    Object.entries(original).reverse(),
  ) as unknown as typeof original;
  assert.equal(authoredMapKey(original), authoredMapKey(reordered));
  for (const change of [
    (map: EditableData<typeof original>) => {
      map.terrain[0] = 'grass';
    },
    (map: EditableData<typeof original>) => {
      map.deposits[0].quantity++;
    },
    (map: EditableData<typeof original>) => {
      map.spawn.x += 0.01;
    },
  ]) {
    const changed = structuredClone(original) as EditableData<typeof original>;
    change(changed);
    assert.equal(changed.id, original.id);
    assert.throws(
      () => assertSameAuthoredMap(changed, original),
      /save is invalid.*map has changed/,
    );
  }
});
