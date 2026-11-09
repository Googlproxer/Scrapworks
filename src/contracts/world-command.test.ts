import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validWorldCommand } from './world-command';

test('overflow commands accept only cardinal string directions or null', () => {
  const command = { type: 'fluid-overflow', target: 'junction' };
  for (const direction of ['north', 'east', 'south', 'west', null])
    assert(validWorldCommand({ ...command, direction }));
  for (const direction of [
    ['east'],
    ['north', 'east'],
    {},
    { toString: () => 'east' },
    undefined,
    false,
    1,
    '',
    'East',
  ])
    assert(!validWorldCommand({ ...command, direction }));
  assert(!validWorldCommand({ ...command, target: ['junction'], direction: 'east' }));
});
