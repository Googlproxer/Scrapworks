/** Copied into an isolated production-optimized diagnostic project. Never imported by the shipped application. */
export interface TraceEvent {
  stage: string;
  now: number;
  origin: number;
  frame: number;
  realm: 'main' | 'simulation' | 'physics';
  data: Record<string, unknown>;
}
export interface ProbeBuffer {
  events: TraceEvent[];
  dropped: number;
}
interface ProbeApi {
  readonly version: 2;
  drain(): ProbeBuffer;
  mark(stage: string, data: Record<string, unknown>): void;
  enabled: boolean;
}
export interface ExperimentInput {
  probeId: number | undefined;
  arm(id: number, operation: string, device: string): void;
  setGamepad(x: number, y: number, connected?: boolean): void;
  syntheticGamepad: boolean;
}
declare global {
  var __scrapworksPhysicsProbe: ProbeApi | undefined;
  var __scrapworksExperimentInput: ExperimentInput | undefined;
}

const capacity = 65536;
const buffer: (TraceEvent | undefined)[] = new Array(capacity);
let written = 0,
  read = 0,
  dropped = 0,
  frame = 0;
const workerName = (globalThis as typeof globalThis & { name?: string }).name;
const realm =
  typeof document === 'undefined'
    ? workerName === 'scrapworks-physics'
      ? 'physics'
      : 'simulation'
    : 'main';
const api: ProbeApi = {
  version: 2,
  enabled: true,
  drain() {
    const events: TraceEvent[] = [];
    while (read < written) {
      const index = read++ % capacity;
      events.push(buffer[index]!);
      buffer[index] = undefined;
    }
    const result = { events, dropped };
    dropped = 0;
    return result;
  },
  mark: trace,
};
globalThis.__scrapworksPhysicsProbe = api;

export function trace(stage: string, data: Record<string, unknown> = {}): void {
  if (!api.enabled) return;
  if (stage === 'frame-begin') ++frame;
  if (written - read === capacity) {
    ++dropped;
    return;
  }
  buffer[written++ % capacity] = {
    stage,
    data: { ...data, probeId: globalThis.__scrapworksExperimentInput?.probeId },
    now: performance.now(),
    origin: performance.timeOrigin,
    frame,
    realm,
  };
}

export function drainTrace(): ProbeBuffer {
  return api.drain();
}
