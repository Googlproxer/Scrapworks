import type { WorldDefinition } from '../../src/contracts/world.ts';

/** Plain gameplay metres; compiler tests own the separate Editor-marker fixture. */
export function worldFixture(): WorldDefinition {
  return {
    version: 1,
    id: 'test-world',
    grid: { origin: { x: -10, z: -10 }, columns: 10, rows: 10, metresPerCell: 2 },
    terrain: Array<string>(100).fill('soil'),
    spawn: { x: 1, y: 0, z: 1 },
    deposits: [
      {
        id: 'scrap',
        kind: 'scrap',
        quantity: 100,
        position: { x: -3, y: 0, z: 1 },
        footprint: { width: 1, depth: 1 },
        rotation: 0,
      },
    ],
    blockers: [
      {
        id: 'blocker',
        position: { x: 3, y: 0, z: -1 },
        footprint: { width: 1, depth: 1 },
        rotation: 0,
      },
    ],
  };
}
