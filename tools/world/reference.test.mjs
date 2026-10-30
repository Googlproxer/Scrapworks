import './register-typescript.mjs';
import test from 'node:test';
const { ReferenceSimulation } = await import('./reference-simulation.ts');
const { Simulation } = await import('../../src/simulation/ecs-runtime.ts');
import { compileMarkers } from './compile.mjs';
import { fixtureMarkers } from './test-fixture.mjs';
test('private ECS movement and placement agree with the legacy plain-object oracle for seeded streams', () => {
  for (let seed of [1729, 451, 983]) {
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const definition = compileMarkers(fixtureMarkers());
    const ecs = new Simulation(definition, { developerFixture: true }),
      reference = new ReferenceSimulation(definition);
    for (let tick = 0; tick < 1000; tick++) {
      if (tick % 17 === 0) {
        const command = {
          type: 'place',
          buildingId: 'test-building',
          cell: { column: next() % 10, row: next() % 10 },
          rotation: next() % 4,
        };
        ecs.enqueue(command);
        reference.enqueue(command);
      }
      if (tick % 131 === 0) {
        ecs.clearInput();
        reference.clearInput();
      }
      const movement = { x: (next() % 3) - 1, z: (next() % 3) - 1, sprint: next() % 7 === 0 };
      ecs.step(movement);
      reference.step(movement);
      reference.assertMatches(ecs.view);
    }
    ecs.dispose();
  }
});
