import type { RuntimeRequest } from '../../src/contracts/simulation';
import { measuredRuntime } from './production-measure';
import type { Workload } from './production-fixture';
let runtime: ReturnType<typeof measuredRuntime> | undefined;
let workload: Workload | undefined;
globalThis.onmessage = (event: MessageEvent<RuntimeRequest & { fixtureWorkload?: Workload }>) => {
  if (
    event.data.operation === 'initialize' &&
    (!runtime || workload !== event.data.fixtureWorkload)
  ) {
    runtime?.dispose();
    workload = event.data.fixtureWorkload ?? 'normal';
    runtime = measuredRuntime(workload);
  }
  if (!runtime) throw new Error('Missing runtime');
  const reply = runtime.handle(event.data);
  globalThis.postMessage(reply, {
    transfer: reply.packet ? [reply.packet.rows, reply.packet.removed] : [],
  });
};
