import type { WorldDefinition } from '../contracts/world';
import { GameSession } from '../app/features/game/session/game-session';
import { Simulation } from './simulation';

const definition: WorldDefinition = {
  version: 1,
  id: 'test-world',
  grid: { origin: { x: -10, z: -10 }, columns: 10, rows: 10, metresPerCell: 2 },
  terrain: Array<string>(100).fill('soil'),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [],
  blockers: [],
};

describe('Simulation', () => {
  let simulation: Simulation;

  beforeEach(() => {
    simulation = new Simulation(definition);
  });

  it('starts empty and rejects unavailable construction without granting resources', () => {
    simulation.enqueue({
      type: 'place',
      buildingId: 'test-building',
      cell: { column: 4, row: 6 },
      rotation: 0,
    });
    simulation.step({ x: 0, z: 0, sprint: false });
    expect(simulation.view.inventory).toEqual({});
    expect(simulation.view.equipment).toEqual([]);
    expect(simulation.view.research).toEqual([]);
    expect(simulation.view.buildings).toEqual([]);
    expect(simulation.view.lastCommandResult?.reason).toBe('unavailable');
  });

  it('advances equal distances across rendering schedules and clears held movement on pause', () => {
    const slow = new GameSession(definition);
    const fast = new GameSession(definition);
    slow.setMovement({ x: 0, z: 1 });
    fast.setMovement({ x: 0, z: 1 });
    for (let i = 0; i < 30; i++) slow.advance(1 / 30);
    for (let i = 0; i < 144; i++) fast.advance(1 / 144);
    expect(slow.view).toEqual(fast.view);
    expect(slow.view.player.position.z).toBeCloseTo(2.5);
    slow.setPaused(true);
    slow.advance(60);
    slow.setPaused(false);
    slow.advance(0.05);
    expect(slow.view.player.position.z).toBeCloseTo(2.5);
  });
});
