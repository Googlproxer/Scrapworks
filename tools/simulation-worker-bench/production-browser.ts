import { GameSession } from '../../src/session/game-session';
import { WorkerSimulationPort } from '../../src/session/worker-port';
import type { SimulationPort } from '../../src/session/port';
import type {
  RuntimeReply,
  RuntimeRequest,
  SimulationCapture,
} from '../../src/contracts/simulation';
import { measuredRuntime, type MeasuredReply, type Times } from './production-measure';
import { fixture, definition, type Workload } from './production-fixture';

interface Options {
  execution: 'inline' | 'worker';
  size: number;
  workload: string;
  ticks?: number;
  warmupTicks?: number;
  warmupMs?: number;
  durationMs?: number;
  pressureMs?: number;
  hz?: number;
}
type Samples = Record<string, number[]>;
const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};
const percentile = (values: number[]) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y),
    at = (p: number) => a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)];
  return {
    count: a.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: a[a.length - 1],
    mean: a.reduce((x, y) => x + y, 0) / a.length,
  };
};
const stats = (samples: Samples) =>
  Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, percentile(values)]));
const hash = async (capture: SimulationCapture): Promise<string> =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(capture))),
    ),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
const workloadOf = (o: Options): Workload =>
  o.workload === 'mixed' ? 'normal' : (o.workload as Workload);
let active: GameSession | undefined, master: SimulationPort | undefined, latestOptions: Options;
let held: SimulationCapture | undefined;
let times: Times = { execution: 0, systems: 0, structural: 0, publication: 0, packing: 0 },
  hostApply = 0,
  receive = 0,
  post = 0,
  records = 0,
  bytes = 0,
  details = 0;
let receiptEnd = 0,
  wholeReceiver = 0;

async function initialize(options: Options, reuse = false, capture?: SimulationCapture) {
  active?.dispose();
  active = undefined;
  if (!reuse || !master) {
    master?.dispose();
    if (options.execution === 'worker')
      master = new WorkerSimulationPort(
        new Worker(new URL('./production-worker.ts', import.meta.url), { type: 'module' }),
        (ms) => {
          receive = ms;
          receiptEnd = performance.now();
        },
      );
    else {
      let runtime = measuredRuntime(workloadOf(options));
      master = {
        send: (request) => {
          if (request.operation === 'initialize') {
            runtime.dispose();
            runtime = measuredRuntime(workloadOf(options));
          }
          return runtime.handle(request);
        },
        dispose: () => runtime.dispose(),
      };
    }
  }
  latestOptions = { ...options };
  const port: SimulationPort = {
    dispose: () => undefined,
    send: (request: RuntimeRequest) => {
      const start = performance.now();
      const value = master!.send({
        ...request,
        ...(request.operation === 'initialize' ? { fixtureWorkload: workloadOf(options) } : {}),
      });
      post = performance.now() - start;
      const done = (reply: RuntimeReply): RuntimeReply => {
        times = (reply as MeasuredReply).times;
        return reply;
      };
      return value instanceof Promise ? value.then(done) : done(value);
    },
  };
  const start = performance.now();
  active = new GameSession(definition, {
    portFactory: () => port,
    capture: capture ?? fixture(options.size, workloadOf(options)),
  });
  const apply = active.cache.apply.bind(active.cache);
  active.cache.apply = (packet, generation) => {
    const begin = performance.now();
    const result = apply(packet, generation);
    hostApply = performance.now() - begin;
    wholeReceiver = receive + (receiptEnd ? performance.now() - receiptEnd : hostApply);
    records = packet.rows.byteLength / 112;
    bytes = packet.rows.byteLength + packet.removed.byteLength;
    details = packet.details.length;
    return result;
  };
  await active.ready;
  active.subscribeDetails('e0r0', () => undefined);
  await active.settled();
  return { initializationMs: performance.now() - start };
}
function step(): void | Promise<void> {
  active!.flushCompleted();
  active!.advance(0.05);
  if (latestOptions.execution === 'worker')
    return active!.settled().then(() => {
      if (active!.failed) throw active!.error;
    });
}
async function ticks(count: number) {
  for (let n = 0; n < count; n++) {
    const pending = step();
    if (pending instanceof Promise) await pending;
  }
  active!.flushCompleted();
}
async function warm(options: Options) {
  const { initializationMs: coldInitializationMs } = await initialize(options);
  const begin = performance.now();
  let count = 0;
  while (
    count < (options.warmupTicks ?? 200) ||
    performance.now() - begin < (options.warmupMs ?? 2000)
  ) {
    const pending = step();
    if (pending instanceof Promise) await pending;
    count++;
  }
  await initialize(options, true);
  return { warmupTicks: count, coldInitializationMs };
}
async function dispose() {
  active?.dispose();
  active = undefined;
  master?.dispose();
  master = undefined;
  held = undefined;
}
async function trial(options: Options) {
  const warmed = await warm(options);
  const firstStart = performance.now();
  const first = step();
  if (first instanceof Promise) await first;
  const firstTickMs = performance.now() - firstStart;
  const samples: Samples = Object.fromEntries(
    [
      'roundTrip',
      'workAndPublication',
      'systems',
      'structural',
      'publication',
      'packing',
      'execution',
      'hostApply',
      'receiveData',
      'observedReceiver',
      'records',
      'bufferBytes',
      'detailRecords',
      'postMessage',
    ].map((key) => [key, []]),
  );
  const start = performance.now();
  let measuredTicks = 0;
  for (let n = 0; n < (options.ticks ?? 2000); n++) {
    const begin = performance.now(),
      pending = step();
    if (pending instanceof Promise) await pending;
    samples['roundTrip'].push(performance.now() - begin);
    for (const key of ['systems', 'structural', 'publication', 'packing', 'execution'] as const)
      samples[key].push(times[key]);
    samples['workAndPublication'].push(times.execution + times.publication);
    samples['hostApply'].push(hostApply);
    samples['receiveData'].push(receive);
    samples['observedReceiver'].push(options.execution === 'worker' ? wholeReceiver : hostApply);
    samples['records'].push(records);
    samples['bufferBytes'].push(bytes);
    samples['detailRecords'].push(details);
    samples['postMessage'].push(post);
    measuredTicks++;
    check(
      records >= options.size * (options.workload === 'idle' ? 0.02 : 0.14),
      'Unexpected inactive/depleted publication',
    );
    check(records <= options.size && details <= 2, 'Unbounded publication');
    if (performance.now() - start > 120000) break;
  }
  const durationMs = performance.now() - start;
  active!.flushCompleted();
  const captured = await active!.capture();
  active!.cache.verify(captured.world.entities);
  check(
    captured.world.resources.counters['completed'] >
      measuredTicks * options.size * (options.workload === 'idle' ? 0.00001 : 0.0001),
    'Meaningful completed work stopped',
  );
  const fingerprint = await hash(captured),
    resources = captured.world.resources;
  const disposalStart = performance.now();
  await dispose();
  return {
    status: measuredTicks === (options.ticks ?? 2000) ? 'ok' : 'timeout',
    ...warmed,
    firstTickMs,
    samples,
    statistics: stats(samples),
    measuredTicks,
    durationMs,
    throughput: (measuredTicks * 1000) / durationMs,
    resources,
    hash: fingerprint,
    disposalMs: performance.now() - disposalStart,
  };
}
async function correctness(options: Options) {
  const assertions: string[] = [];
  await initialize(options);
  await ticks(37);
  const captured = await active!.capture();
  active!.cache.verify(captured.world.entities);
  await ticks(1000);
  const expected = await hash(await active!.capture());
  await initialize(options, false, JSON.parse(JSON.stringify(captured)));
  await ticks(1000);
  check((await hash(await active!.capture())) === expected, 'Fresh worker continuation mismatch');
  assertions.push('Production schemas/codec and fresh-runtime 1000-step continuation');
  active!.setPaused(true);
  await active!.settled();
  const paused = active!.readView().tick;
  active!.advance(60);
  await active!.settled();
  check(active!.readView().tick === paused, 'Tick followed pause acknowledgement');
  active!.setPaused(false);
  await active!.settled();
  await ticks(1);
  check(active!.readView().tick === paused + 1, 'Hidden-time catch-up');
  assertions.push('Pause/resume and no hidden-time catch-up');
  const inspection = await active!.inspect('player');
  inspection!.entity.inventory!.slots[0] = null;
  check(
    (await active!.inspect('player'))!.entity.inventory!.slots[0] !== undefined,
    'Detached inspection unavailable',
  );
  await dispose();
  return { status: 'ok', assertions };
}
async function frameTimingProbe() {
  const begin = performance.now();
  while (performance.now() - begin < 45) {
    /* injected scheduling delay */
  }
  const interval = await new Promise<number>((resolve) =>
    requestAnimationFrame(() => resolve(performance.now() - begin)),
  );
  check(interval >= 45, 'Callback delay was hidden');
  return 'Callback-arrival frame recorder detects injected 45ms delay';
}
async function paced(options: Options) {
  const warmed = await warm(options),
    samples: Samples = {
      frames: [],
      rafTimelineIntervals: [],
      callbackLateness: [],
      inputToVisible: [],
      frameReceiver: [],
      viewAge: [],
      interpolatedAge: [],
      catchupDuration: [],
    };
  const tasks: { startTime: number; duration: number }[] = [];
  const observer = new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries())
      tasks.push({ startTime: entry.startTime, duration: entry.duration });
  });
  observer.observe({ type: 'longtask', buffered: false });
  const inputAt = new Map<number, number>();
  let nextInput = 0,
    sequence = 0,
    lastApplied = 0;
  let previous = performance.now(),
    lastTimeline: number | undefined,
    frames = 0,
    maxQueue = 0,
    maxBacklogMs = 0;
  const start = previous;
  await new Promise<void>((resolve, reject) => {
    const frame = (timeline: number): void => {
      try {
        const now = performance.now();
        if (now - start >= (options.durationMs ?? 30000)) {
          resolve();
          return;
        }
        samples['frames'].push(now - previous);
        if (lastTimeline !== undefined)
          samples['rafTimelineIntervals'].push(timeline - lastTimeline);
        samples['callbackLateness'].push(Math.max(0, now - timeline));
        lastTimeline = timeline;
        const seconds = (now - previous) / 1000;
        previous = now;
        frames++;
        active!.flushCompleted();
        if (active!.appliedInput > lastApplied) {
          for (const [seq, at] of inputAt)
            if (seq <= active!.appliedInput) {
              samples['inputToVisible'].push(now - at);
              inputAt.delete(seq);
            }
          lastApplied = active!.appliedInput;
        }
        if (now >= nextInput) {
          sequence++;
          inputAt.set(active!.submittedInput + 1, now);
          active!.setMovement({ x: sequence % 2, z: 0 });
          nextInput = now + 250;
        }
        const dispatchStart = performance.now();
        active!.advance(seconds);
        samples['catchupDuration'].push(performance.now() - dispatchStart);
        maxQueue = Math.max(maxQueue, active!.pendingSteps ? 1 : 0);
        maxBacklogMs = Math.max(maxBacklogMs, active!.maxPendingSteps * 50);
        document.getElementById('view')!.textContent =
          `Completed tick ${active!.readView().tick}; ${options.size} simulated records; no per-record meshes.`;
        const pressure = performance.now();
        while (performance.now() - pressure < (options.pressureMs ?? 0)) {
          /* host pressure */
        }
        if (options.hz === 120)
          setTimeout(
            () => frame(performance.now()),
            Math.max(0, 1000 / 120 - (performance.now() - now)),
          );
        else requestAnimationFrame(frame);
      } catch (error) {
        reject(error);
      }
    };
    requestAnimationFrame(frame);
  });
  await active!.settled();
  active!.flushCompleted();
  observer.disconnect();
  const result = {
    status: 'ok',
    options,
    ...warmed,
    durationMs: performance.now() - start,
    frames,
    ticks: active!.readView().tick,
    publications: active!.cache.version,
    statistics: stats(samples),
    samples,
    longTasks: tasks,
    maxQueue,
    maxBacklogMs,
    droppedMs: active!.droppedSeconds * 1000,
    pendingInputProbes: inputAt.size,
  };
  await dispose();
  return result;
}
async function captureHeld() {
  held = await active!.capture();
}
async function rebuildHeld() {
  check(held, 'Missing capture');
  await initialize(latestOptions, true, held);
}
async function releaseHeld() {
  held = undefined;
}
async function ancillary(options: Options) {
  const begin = performance.now();
  await initialize(options);
  const initializationMs = performance.now() - begin;
  await ticks(20);
  const captureStart = performance.now();
  let captured: SimulationCapture | undefined = await active!.capture();
  const captureMs = performance.now() - captureStart;
  const encode = performance.now();
  let encoded = JSON.stringify(captured);
  const encodingMs = performance.now() - encode,
    snapshotBytes = new TextEncoder().encode(encoded).byteLength;
  captured = undefined;
  const decode = performance.now();
  captured = JSON.parse(encoded) as SimulationCapture;
  const decodingMs = performance.now() - decode;
  encoded = '';
  const rebuild = performance.now();
  await initialize(options, true, captured);
  captured = undefined;
  const rebuildMs = performance.now() - rebuild;
  const end = performance.now();
  await dispose();
  return {
    initializationMs,
    captureMs,
    encodingMs,
    decodingMs,
    snapshotBytes,
    rebuildMs,
    disposalMs: performance.now() - end,
  };
}
async function payloadSizes(options: Options) {
  await initialize(options);
  await ticks(10);
  const normal = { records, bytes, details };
  await active!.resynchronize();
  const full = { records, bytes, details };
  await dispose();
  return { normal, full, stride: 14, subscriptions: 2 };
}
async function cycle(options: Options) {
  await initialize(options);
  await ticks(5);
  await captureHeld();
  await rebuildHeld();
  await releaseHeld();
  await ticks(5);
  await dispose();
}
Object.assign(window, {
  simulationWorkerBench: {
    initialize,
    trial,
    paced,
    correctness,
    frameTimingProbe,
    ancillary,
    payloadSizes,
    ticks,
    captureHeld,
    rebuildHeld,
    releaseHeld,
    dispose,
    disposeWorldForProfile: async () => active!.disposeWorldForProfile(),
    cycle,
    status: () => ({ tick: active?.readView().tick, size: active?.cache.size }),
  },
});
