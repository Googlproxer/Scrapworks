import type { CDPSession } from 'playwright';
// Playwright does not expose these generated declarations as a package subpath.
// This type-only path is erased; runtime access uses the public CDPSession API.
import type { Protocol } from '../node_modules/playwright-core/types/protocol.d.ts';

export type { Protocol };

/** The same typed protocol is used for a page and for a nested worker session. */
export interface ProfilingContext {
  name: string;
  send<M extends keyof Protocol.CommandParameters>(
    method: M,
    params?: Protocol.CommandParameters[M],
  ): Promise<Protocol.CommandReturnValues[M]>;
  on(
    name: 'HeapProfiler.addHeapSnapshotChunk',
    listener: (event: Protocol.HeapProfiler.addHeapSnapshotChunkPayload) => void,
  ): void;
  off(
    name: 'HeapProfiler.addHeapSnapshotChunk',
    listener: (event: Protocol.HeapProfiler.addHeapSnapshotChunkPayload) => void,
  ): void;
}

export function pageProfilingContext(session: CDPSession): ProfilingContext {
  return {
    name: 'main',
    send: (method, params) => session.send(method, params),
    on: (name, listener) => {
      session.on(name, listener);
    },
    off: (name, listener) => {
      session.off(name, listener);
    },
  };
}
