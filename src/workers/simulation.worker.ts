/// <reference lib="webworker" />
import { SimulationRuntime } from '../session/runtime';
import type { RuntimeReply } from '../contracts/simulation';
const runtime = new SimulationRuntime();
addEventListener('message', (event: MessageEvent<unknown>) => {
  let reply: RuntimeReply;
  try {
    reply = runtime.handle(event.data);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  postMessage(reply, reply.packet ? [reply.packet.rows, reply.packet.removed] : []);
});
