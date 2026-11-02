/// <reference lib="webworker" />
import type { RuntimeReply } from '../contracts/simulation';

// Install the message boundary before loading the asynchronous WASM dependency.
// Module evaluation must not leave early initialize messages without a listener.
const ready = import('../session/runtime').then(({ SimulationRuntime }) => new SimulationRuntime());
let failed = false;

function fatal(error: unknown): void {
  if (failed) return;
  failed = true;
  // Surface asynchronous bootstrap failures through the existing native worker error boundary.
  queueMicrotask(() => {
    throw error instanceof Error ? error : new Error(String(error));
  });
}

void ready.catch(fatal);
addEventListener('message', (event: MessageEvent<unknown>) => {
  void ready
    .then((runtime) => {
      if (failed) return;
      const reply: RuntimeReply = runtime.handle(event.data);
      postMessage(
        reply,
        reply.packet
          ? [
              reply.packet.rows,
              reply.packet.removed,
              ...(reply.packet.rotations ? [reply.packet.rotations] : []),
            ]
          : [],
      );
    })
    .catch(fatal);
});
