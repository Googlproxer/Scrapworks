import assert from 'node:assert/strict';
import { test } from 'vitest';
import { assertWorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { FrameClock } from '@game/timing/frame-clock';
import { Simulation } from '@simulation/simulation';
import { cellCenter as relativeCellCenter } from '../../src/core/world-grid.ts';
import ts from 'typescript';

test('Vitest resolves tsconfig source aliases, relative imports and native packages', async () => {
  assert.equal(typeof assertWorldDefinition, 'function');
  assert.equal(cellCenter, relativeCellCenter);
  assert.equal(new FrameClock().sample(100), 0);
  assert.equal(typeof Simulation, 'function');
  assert.equal(typeof ts.resolveModuleName, 'function');
  const missingSource = '@simulation/does-not-exist';
  await assert.rejects(import(missingSource));
});
