import type { WorldCommand, QuarterTurn } from '../../src/contracts/world.ts';
import '../../tools/testing/register-typescript.ts';
import test from 'node:test';
const { ReferenceSimulation } = await import('../support/reference-simulation.ts');
const { Simulation } = await import('../../src/simulation/ecs-runtime.ts');
import { worldFixture } from '../support/world-fixture.ts';
test('private ECS movement and placement agree with the legacy plain-object oracle for seeded streams', () => {
  for (let seed of [1729, 451, 983]) {
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);

    const definition = worldFixture();
    const ecs = new Simulation(definition, { developerFixture: true }),
      reference = new ReferenceSimulation(definition);
    for (let tick = 0; tick < 1000; tick++) {
      let commands: WorldCommand[] = [];
      if (tick % 17 === 0) {
        const command: WorldCommand = {
          type: 'place',
          buildingId: 'test-building',
          cell: { column: next() % 10, row: next() % 10 },
          rotation: (next() % 4) as QuarterTurn,
        };
        commands.push(command);
        reference.enqueue(command);
      }
      if (tick % 131 === 0) {
        commands = [];
        ecs.clearInput();
        reference.clearInput();
      }
      const movement = { x: (next() % 3) - 1, z: (next() % 3) - 1, sprint: next() % 7 === 0 };
      ecs.step(movement, commands);
      reference.step(movement);
      reference.assertMatches(ecs.view);
    }
    ecs.dispose();
    reference.dispose();
  }
});
