/// <reference lib="webworker" />
import type { PhysicsRequest, PhysicsReply } from './physics-protocol.ts';
const ready = import('./physics-host.ts');

// A native bootstrap boundary, owned by this short-lived diagnostic worker.
addEventListener(
  'message',
  (event: MessageEvent<{ port: MessagePort }>) => {
    const port = event.data.port;
    port.addEventListener('message', (message: MessageEvent<PhysicsRequest>) => {
      void ready
        .then(({ handlePhysics }) => {
          const reply: PhysicsReply = handlePhysics(message.data);
          port.postMessage(reply);
        })
        .catch((error) => {
          setTimeout(() => {
            throw error;
          });
        });
    });
    port.start();
  },
  { once: true },
);
