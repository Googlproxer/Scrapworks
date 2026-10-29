import { InjectionToken } from '@angular/core';
import type { SimulationPortFactory } from '../../../session/port';
import { WorkerSimulationPort } from '../../../session/worker-port';
export const SIMULATION_PORT_FACTORY = new InjectionToken<SimulationPortFactory>(
  'simulation port factory',
  {
    providedIn: 'root',
    factory: () => () => new WorkerSimulationPort(),
  },
);
