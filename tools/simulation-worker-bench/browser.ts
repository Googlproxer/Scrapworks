import { Client } from './client.ts';
import { correctness } from './check.ts';
import { expectedDirtyCounts } from '../ecs-bench/consumer.ts';
import { assert, Credits, epoch } from './protocol.ts';
import type { Capture, Options, Reply, Request } from './protocol.ts';

interface TrialOptions extends Options {
  ticks?: number;
  warmupMs?: number;
  warmupTicks?: number;
  batch?: number;
  yielding?: boolean;
}
type Samples = Record<string, number[]>;
const quantiles = (a: number[]) => {
  if (!a.length) return null;
  const values = [...a].sort((x, y) => x - y);
  const p = (n: number) => values[Math.min(values.length - 1, Math.ceil(values.length * n) - 1)];
  return {
    count: values.length,
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: values[values.length - 1],
    mean: a.reduce((x, y) => x + y, 0) / a.length,
  };
};
const stats = (samples: Samples) =>
  Object.fromEntries(Object.entries(samples).map(([key, a]) => [key, quantiles(a)]));
function commands(tick: number): Partial<Request> {
  return {
    steps: 1,
    input: { x: tick % 2, z: (tick % 3) - 1, sprint: tick % 7 === 0 },
    commands: tick % 17 === 0 ? [{ sequence: tick / 17, value: tick }] : [],
  };
}
async function hash(capture: Capture): Promise<string> {
  const world = capture.world;
  const canonical = {
    ...capture,
    world: {
      ...world,
      fixture: {
        size: world.fixture.size,
        seed: world.fixture.seed,
        workload: world.fixture.workload,
      },
    },
  };
  const buffer = new TextEncoder().encode(JSON.stringify(canonical));
  const value = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(value), (v) => v.toString(16).padStart(2, '0')).join('');
}
let active: Client | undefined;
async function initialize(options: Options): Promise<{ initializationMs: number }> {
  if (active) await active.dispose();
  active = new Client(options);
  const start = performance.now();
  await active.initialize();
  return { initializationMs: performance.now() - start };
}
async function warm(options: TrialOptions): Promise<number> {
  const temporary = new Client(options);
  await temporary.initialize();
  const start = performance.now();
  let ticks = 0;
  while (
    ticks < (options.warmupTicks ?? 200) ||
    performance.now() - start < (options.warmupMs ?? 2000)
  ) {
    const reply = temporary.request('advance', { steps: 1 });
    if (reply instanceof Promise) await reply;
    ticks++;
  }
  await temporary.dispose();
  return ticks;
}
async function trial(options: TrialOptions) {
  const warmupTicks = await warm(options);
  const { initializationMs } = await initialize(options);
  const client = active!;
  const firstStart = performance.now();
  await client.request('advance', commands(1));
  const firstTickMs = performance.now() - firstStart;
  const samples: Samples = {
    roundTrip: [],
    workAndPublication: [],
    systems: [],
    structural: [],
    publication: [],
    packing: [],
    execution: [],
    hostApply: [],
    requestDeliveryEstimate: [],
    responseDeliveryEstimate: [],
    records: [],
  };
  const expected = expectedDirtyCounts(options);
  const start = performance.now();
  let timedOut = false;
  let measuredTicks = 0;
  for (let i = 0; i < (options.ticks ?? 2000); i++) {
    const tick = client.tick + 1;
    const begin = performance.now();
    const sent = epoch();
    const count = Math.min(options.batch ?? 1, (options.ticks ?? 2000) - i);
    const batchCommands = Array.from({ length: count }, (_, n) => tick + n)
      .filter((n) => n % 17 === 0)
      .map((n) => ({ sequence: n / 17, value: n }));
    const pending = client.request('advance', {
      ...commands(tick),
      commands: batchCommands,
      steps: count,
      yieldSteps: options.yielding,
    });
    const reply = pending instanceof Promise ? await pending : pending;
    const elapsed = performance.now() - begin;
    measuredTicks += reply.steps;
    samples['roundTrip'].push(elapsed);
    samples['hostApply'].push(client.hostApplyMs);
    samples['workAndPublication'].push(
      reply.times.execution + reply.times.publication + reply.times.packing,
    );
    for (const phase of ['systems', 'structural', 'publication', 'packing', 'execution'] as const)
      samples[phase].push(reply.times[phase]);
    samples['requestDeliveryEstimate'].push(Math.max(0, reply.receivedEpoch - sent));
    samples['responseDeliveryEstimate'].push(
      Math.max(0, client.receiveEpoch - reply.producedEpoch),
    );
    const records = reply.frame?.view.records.length ?? 0;
    samples['records'].push(records);
    if (count === 1)
      assert(records === expected[client.tick % 100], 'Changed-record count mismatch');
    i += count - 1;
    if (performance.now() - start > 120000) {
      timedOut = true;
      break;
    }
  }
  const durationMs = performance.now() - start;
  const diagnostic = await client.request('stats');
  const captured = (await client.request('capture')).capture!;
  assert(
    captured.world.resources.completed >
      measuredTicks * options.size * (options.workload === 'idle' ? 0.00001 : 0.0001),
    'Meaningful work stopped',
  );
  assert(
    JSON.stringify(client.records) === JSON.stringify(captured.world.records),
    'Detached receiver cache mismatch',
  );
  const fingerprint = await hash(captured);
  const resources = captured.world.resources;
  const disposalStart = performance.now();
  await client.dispose();
  active = undefined;
  return {
    status: timedOut ? 'timeout' : 'ok',
    options,
    warmupTicks,
    initializationMs,
    firstTickMs,
    samples,
    statistics: stats(samples),
    postMessage: quantiles((diagnostic.posts ?? []).slice(2)),
    coldPostMessage: diagnostic.posts?.[0],
    measuredTicks,
    durationMs,
    throughput: (measuredTicks / durationMs) * 1000,
    resources,
    hash: fingerprint,
    disposalMs: performance.now() - disposalStart,
  };
}
async function paced(
  options: TrialOptions & { durationMs: number; pressureMs: number; hz?: number },
) {
  await warm(options);
  await initialize(options);
  const client = active!;
  const credits = new Credits();
  const samples: Samples = {
    frames: [],
    acknowledgement: [],
    inputToApplied: [],
    inputToVisible: [],
    hostApply: [],
    workerPublication: [],
    viewAge: [],
    authorityAgeEstimate: [],
    interpolatedAge: [],
  };
  const tasks: { startTime: number; duration: number }[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      tasks.push({ startTime: entry.startTime, duration: entry.duration });
  });
  observer.observe({ type: 'longtask', buffered: false });
  let pending: Promise<void> | undefined;
  let outstanding = 0;
  let error: unknown;
  let frames = 0;
  let ticks = 0;
  let prior = performance.now();
  const start = prior;
  let lastFrame = prior;
  let latestAt = prior;
  let maxQueue = 0;
  let visualTick = 0;
  let inputSequence = 0;
  let nextInputAt = start;
  let lastAuthorityEpoch = epoch();
  let queuedCommands: { sequence: number; value: number }[] = [];
  const inputAt = new Map<number, number>();
  const visible: number[] = [];
  const workerClock = options.clock === 'worker';
  if (workerClock) await client.request('clock-start');
  const dispatch = (steps: number): void => {
    const begin = performance.now();
    const beforeTick = client.tick;
    const complete = (reply: Reply): void => {
      samples['acknowledgement'].push(performance.now() - begin);
      samples['hostApply'].push(client.hostApplyMs);
      samples['workerPublication'].push(reply.times.execution + reply.times.publication);
      for (const [sequence, sampledAt] of inputAt)
        if (sequence <= (reply.ledger?.appliedSequence ?? 0)) {
          samples['inputToApplied'].push(performance.now() - sampledAt);
          visible.push(sampledAt);
          inputAt.delete(sequence);
        }
      lastAuthorityEpoch = reply.producedEpoch;
      ticks += Math.max(0, reply.tick - beforeTick);
      latestAt = performance.now();
      outstanding = 0;
    };
    outstanding = steps;
    const result = client.request(workerClock ? 'clock-poll' : 'advance', {
      steps,
      input: { x: inputSequence % 2, z: 0, sprint: false },
      commands: queuedCommands,
    });
    queuedCommands = [];
    if (result instanceof Promise)
      pending = result
        .then(complete)
        .catch((cause: unknown) => {
          error = cause;
        })
        .finally(() => {
          pending = undefined;
        });
    else complete(result);
    maxQueue = Math.max(maxQueue, client.pendingCount);
  };
  await new Promise<void>((resolve) => {
    const frame = (now: number): void => {
      if (error || now - start >= options.durationMs) {
        resolve();
        return;
      }
      samples['frames'].push(now - prior);
      prior = now;
      frames++;
      const present = performance.now();
      for (const sampledAt of visible) samples['inputToVisible'].push(present - sampledAt);
      visible.length = 0;
      if (present >= nextInputAt) {
        inputSequence++;
        inputAt.set(inputSequence, present);
        queuedCommands.push({ sequence: inputSequence, value: inputSequence });
        nextInputAt = present + 250;
        assert(inputAt.size <= 256 && queuedCommands.length <= 256, 'Unbounded input queue');
      }
      const delta = now - lastFrame;
      lastFrame = now;
      if (!workerClock) credits.add(delta, outstanding);
      if (!pending) {
        const steps = workerClock ? Number(now - latestAt >= 49) : credits.take(options.batch ?? 1);
        if (steps) dispatch(steps);
      }
      samples['viewAge'].push(Math.max(0, now - latestAt));
      samples['authorityAgeEstimate'].push(Math.max(0, epoch() - lastAuthorityEpoch));
      // Interpolate one completed-tick interval behind authority; never extrapolate.
      const alpha = Math.min(1, Math.max(0, (now - latestAt) / 50));
      visualTick = Math.max(0, client.tick - 1) + alpha;
      document.getElementById('view')!.textContent =
        `Completed tick ${client.tick}; interpolated tick ${visualTick.toFixed(2)}; applied input probe ${client.latest?.ledger?.appliedSequence ?? 0}.`;
      samples['interpolatedAge'].push(Math.max(0, client.tick - visualTick) * 50);
      const pressure = performance.now();
      while (performance.now() - pressure < options.pressureMs) {
        /* Deterministic host pressure, outside simulation. */
      }
      if (options.hz === 120)
        setTimeout(
          () => frame(performance.now()),
          Math.max(0, 1000 / 120 - (performance.now() - now)),
        );
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  if (pending) await pending;
  const diagnostic = await client.request('stats');
  if (workerClock) await client.request('clock-stop');
  observer.disconnect();
  if (error) throw error;
  const final = (await client.request('capture')).capture!;
  const result = {
    options,
    durationMs: performance.now() - start,
    frames,
    ticks,
    statistics: stats(samples),
    samples,
    longTasks: tasks.filter(
      (task) => task.startTime >= start && task.startTime < start + options.durationMs,
    ),
    droppedMs: credits.dropped,
    maxBacklogMs: credits.max,
    maxQueue,
    workerClock: diagnostic.clock,
    completed: final.world.resources.completed,
    pendingInputProbes: inputAt.size,
    refreshMode: options.hz === 120 ? 'emulated-120Hz-timer-diagnostic' : 'observed-RAF',
  };
  await client.dispose();
  active = undefined;
  return result;
}
async function ancillary(options: Options) {
  await initialize(options);
  const client = active!;
  const publication = [];
  for (const full of [false, true])
    for (const fraction of [0, 0.01, 0.1, 1]) {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const result = await client.request('dirty', { fraction, full });
        samples.push({
          roundTrip: performance.now() - start,
          hostApply: client.hostApplyMs,
          publication: result.times.publication,
          packing: result.times.packing,
          records: result.frame?.view.records.length,
        });
      }
      publication.push({ full, fraction, samples });
    }
  const start = performance.now();
  const captured = (await client.request('capture')).capture!;
  const captureMs = performance.now() - start;
  const encodeStart = performance.now();
  const encoded = JSON.stringify(captured);
  const encodeMs = performance.now() - encodeStart;
  const bytes = new TextEncoder().encode(encoded).length;
  const decodeStart = performance.now();
  const decoded = JSON.parse(encoded) as Capture;
  const decodeMs = performance.now() - decodeStart;
  const restoreStart = performance.now();
  await client.initialize(decoded);
  const rebuildMs = performance.now() - restoreStart;
  await client.dispose();
  active = undefined;
  return { publication, captureMs, encodeMs, decodeMs, bytes, rebuildMs };
}

const api = {
  correctness,
  trial,
  paced,
  ancillary,
  initialize,
  async ticks(count: number) {
    const client = active!;
    for (let i = 0; i < count; i++) {
      const r = client.request('advance', { steps: 1 });
      if (r instanceof Promise) await r;
    }
    client.release();
    return { tick: client.tick, completed: client.completed };
  },
  async captureHeld() {
    const r = await active!.request('capture');
    held = r.capture;
    active!.release();
  },
  async rebuildHeld() {
    assert(held, 'No capture');
    await active!.initialize(held);
    active!.release();
  },
  releaseHeld() {
    held = undefined;
    active?.release();
  },
  async dispose() {
    await active?.dispose();
    active = undefined;
    held = undefined;
  },
  async disposeWorldForProfile() {
    held = undefined;
    await active!.disposeWorldForProfile();
  },
  async cycle(options: Options) {
    await initialize(options);
    await api.ticks(3);
    await api.captureHeld();
    await api.rebuildHeld();
    await api.dispose();
  },
  status() {
    return { active: !!active, tick: active?.tick, records: active?.records.length };
  },
};
let held: Capture | undefined;
declare global {
  interface Window {
    simulationWorkerBench: typeof api;
  }
}
window.simulationWorkerBench = api;
document.getElementById('status')!.textContent =
  'Ready. Isolated simulation worker laboratory; no game runtime or authored assets are changed.';
