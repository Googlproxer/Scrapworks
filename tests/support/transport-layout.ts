import type { QuarterTurn } from '../../src/contracts/world.ts';
import type { ConveyorTurn } from '../../src/contracts/transport.ts';

/** Authored 10 × 10 fixture: use the western edge around the moving block's full travel. */
export const SCRAP_RETURN_ROUTE: readonly [number, number, QuarterTurn, ConveyorTurn][] = [
  [4, 8, 0, 'left'],
  [3, 8, 3, 'straight'],
  [2, 8, 3, 'straight'],
  [1, 8, 3, 'straight'],
  [0, 8, 3, 'left'],
  [0, 7, 2, 'straight'],
  [0, 6, 2, 'straight'],
  [0, 5, 2, 'straight'],
  [0, 4, 2, 'straight'],
  [0, 3, 2, 'left'],
  [1, 3, 1, 'straight'],
  [2, 3, 1, 'straight'],
  [3, 3, 1, 'straight'],
  [4, 3, 1, 'straight'],
  [5, 3, 1, 'left'],
  [5, 4, 0, 'straight'],
  [5, 5, 0, 'left'],
  [4, 5, 3, 'right'],
];

/** Return path plus the extractor's turning feed segment. */
export const TRANSPORT_CONVEYOR_COUNT = SCRAP_RETURN_ROUTE.length + 1;
