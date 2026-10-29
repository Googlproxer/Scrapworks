import type { RuntimeRequest } from '../../src/contracts/simulation';
import { measuredRuntime } from './production-measure';
import type { Workload } from './production-fixture';
let runtime: ReturnType<typeof measuredRuntime> | undefined;
globalThis.onmessage = (event: MessageEvent<RuntimeRequest & { fixtureWorkload?: Workload }>) => {
  if (event.data.operation === 'initialize') {
    runtime?.dispose();
    runtime = measuredRuntime(event.data.fixtureWorkload ?? 'normal');
  }
  if (!runtime) throw new Error('Missing runtime');
  const reply = runtime.handle(event.data);
  globalThis.postMessage(reply, {
    transfer: reply.packet ? [reply.packet.rows, reply.packet.removed] : [],
  });
};
