import { Simulation } from '../../src/simulation/ecs-runtime';
import { SimulationRuntime } from '../../src/session/runtime';
import type { RuntimeReply, RuntimeRequest } from '../../src/contracts/simulation';
import { content, system, type Workload } from './production-fixture';

export interface Times {
  execution: number;
  systems: number;
  structural: number;
  publication: number;
  packing: number;
}
export type MeasuredReply = RuntimeReply & { times: Times };
let execution = 0,
  publication = 0,
  systems = 0;
const step = Simulation.prototype.step,
  publish = Simulation.prototype.publish;
Simulation.prototype.step = function (...args) {
  const begin = performance.now();
  try {
    return step.apply(this, args);
  } finally {
    execution += performance.now() - begin;
  }
};
Simulation.prototype.publish = function (...args) {
  const begin = performance.now();
  try {
    return publish.apply(this, args);
  } finally {
    publication += performance.now() - begin;
  }
};
export function measuredRuntime(workload: Workload): {
  handle: (request: RuntimeRequest) => MeasuredReply;
  dispose: () => void;
} {
  const domain = system(workload);
  const runtime = new SimulationRuntime({
    content,
    system: (ctx) => {
      const begin = performance.now();
      try {
        domain(ctx);
      } finally {
        systems += performance.now() - begin;
      }
    },
  });
  return {
    handle: (request) => {
      execution = publication = systems = 0;
      const reply = runtime.handle(request) as MeasuredReply;
      reply.times = {
        execution,
        publication,
        systems,
        structural: Math.max(0, execution - systems),
        packing: 0,
      };
      return reply;
    },
    dispose: () => runtime.dispose(),
  };
}
