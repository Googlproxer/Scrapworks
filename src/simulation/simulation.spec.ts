import { Simulation } from './simulation';

describe('Simulation', () => {
  let simulation: Simulation;

  beforeEach(() => {
    simulation = new Simulation();
  });

  it('should enqueue commands', () => {
    simulation.enqueue('command1');
    simulation.enqueue('command2');
    expect(simulation.queue).toEqual(['command1', 'command2']);
  });
});
