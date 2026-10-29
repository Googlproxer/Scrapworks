import { Runtime } from './runtime.ts';
import type { Reply } from './protocol.ts';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<unknown>) => void;
  postMessage: (reply: Reply, transfer?: Transferable[]) => void;
};
const runtime = new Runtime();
scope.onmessage = (event) => {
  const send = (reply: Reply): void => {
    const start = performance.now();
    scope.postMessage(reply, reply.packed ? [reply.packed] : []);
    runtime.recordPost(performance.now() - start);
  };
  try {
    const result = runtime.handle(event.data);
    if (result instanceof Promise) void result.then(send);
    else send(result);
  } catch (error) {
    scope.postMessage({
      protocol: 1,
      generation: -1,
      revision: -1,
      id: -1,
      ok: false,
      error: String(error),
      receivedEpoch: 0,
      producedEpoch: 0,
      tick: 0,
      steps: 0,
      times: {
        systems: 0,
        structural: 0,
        publication: 0,
        packing: 0,
        execution: 0,
        stepSamples: [],
      },
    });
  }
};
