import type { TraceEvent } from './browser-probe.ts';
import type { Operation } from './protocol.ts';

export interface ProbeAttempt {
  id: number;
  operation: Operation;
  device: 'keyboard' | 'synthetic-gamepad';
  direction: { x: number; z: number };
}
export interface ProbeResult extends ProbeAttempt {
  status: 'completed' | 'pending' | 'timed-out' | 'superseded' | 'blocked';
  observedAt: number | null;
  submittedAt: number | null;
  responseAt: number | null;
  latencyMs: number | null;
  stoppingDistance: number | null;
  inputSequence: number | null;
  tick: number | null;
  generation: number | null;
  reason?: string;
}
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Translation-relative presentation for a fixed-orientation moving support. No world-space fallback. */
export function relativeToSupport(events: readonly TraceEvent[], supportId: string): TraceEvent[] {
  const supports = new Map(events.filter(event => event.realm === 'main' && event.stage === 'body-present' && event.data['id'] === supportId).map(event => [event.frame, event]));
  return events.flatMap(event => {
    if (event.realm !== 'main' || event.stage !== 'present') return [event];
    const support = supports.get(event.frame);
    if (!support) return [];
    const x = number(support.data['x']), z = number(support.data['z']), playerX = number(event.data['x']), playerZ = number(event.data['z']);
    if (x === null || z === null || playerX === null || playerZ === null) throw new Error('Invalid submitted player/support position');
    return [{ ...event, data: { ...event.data, x: playerX - x, z: playerZ - z, supportId } }];
  });
}

/** Same-main-clock transform endpoint. Worker clocks are deliberately not used to compute latency. */
export function detectResponse(
  attempt: ProbeAttempt,
  events: readonly TraceEvent[],
  options: {
    epsilon?: number;
    stationaryFrames?: number;
    windowEndedAt?: number;
    timeoutMs?: number;
    supportId?: string;
    releaseComponentOnly?: boolean;
  } = {},
): ProbeResult {
  if (options.supportId) events = relativeToSupport(events, options.supportId);
  const result: ProbeResult = {
    ...attempt,
    status: 'pending',
    observedAt: null,
    submittedAt: null,
    responseAt: null,
    latencyMs: null,
    stoppingDistance: null,
    inputSequence: null,
    tick: null,
    generation: null,
  };
  const main = events.filter((event) => event.realm === 'main');
  const tagged = main.filter((event) => event.data['probeId'] === attempt.id);
  const raw = tagged.find(
    (event) => event.stage === (attempt.device === 'keyboard' ? 'raw-keyboard' : 'raw-gamepad'),
  );
  if (!raw) {
    result.reason = 'No application-observed input edge/sample';
    return result;
  }
  result.observedAt = raw.now;
  const length = Math.hypot(attempt.direction.x, attempt.direction.z);
  if (attempt.operation !== 'release' && length === 0)
    throw new Error('Movement response needs a direction');
  const matches = (value: unknown) => {
    const input = record(value),
      x = number(input['x']) ?? 0,
      z = number(input['z']) ?? 0;
    return attempt.operation === 'release'
      ? Math.hypot(x, z) < 1e-8
      : x * attempt.direction.x + z * attempt.direction.z > 0;
  };
  const submission = tagged.find(
    (event) =>
      event.stage === 'input-submitted' &&
      event.now >= raw.now &&
      event.data['operation'] === 'advance' &&
      matches(event.data['input']),
  );
  if (!submission) {
    result.reason = 'No matching submission; determine blocking/supersession from the raw trace';
    return expire(result, options);
  }
  result.submittedAt = submission.now;
  result.inputSequence = number(submission.data['inputSequence']);
  result.generation = number(submission.data['generation']);
  if (result.inputSequence === null || result.generation === null)
    throw new Error('Missing causal submission identity');
  const publication = main.find(
    (event) =>
      event.stage === 'publication' &&
      event.now >= submission.now &&
      event.data['generation'] === result.generation &&
      (number(event.data['inputSequence']) ?? -1) >= result.inputSequence!,
  );
  const ticks = publication?.data['ticks'];
  if (!publication || !Array.isArray(ticks) || !ticks.length) {
    result.reason = 'No committed publication for input';
    return expire(result, options);
  }
  result.tick = Math.min(...ticks.filter((value): value is number => typeof value === 'number'));
  const epsilon = options.epsilon ?? 0.0001;
  const submitted = new Map(
    main
      .filter((event) => event.stage === 'frame-submitted')
      .map((event) => [event.frame, event.now]),
  );
  const frames = main.filter((event) => event.stage === 'present' && submitted.has(event.frame));
  let stationary: { now: number; x: number; z: number }[] = [];
  const beforeInput = frames.filter(frame => submitted.get(frame.frame)! <= raw.now && frame.data['generation'] === result.generation).at(-1);
  let anchor: { x: number; z: number } | undefined = beforeInput ? { x: number(beforeInput.data['x'])!, z: number(beforeInput.data['z'])! } : undefined;
  for (let i = 1; i < frames.length; ++i) {
    const current = frames[i],
      previous = frames[i - 1];
    if (
      current.data['generation'] !== result.generation ||
      previous.data['generation'] !== result.generation
    )
      continue;
    if (current.now < publication.now || (number(current.data['tick']) ?? -1) < result.tick)
      continue;
    const now = submitted.get(current.frame);
    if (now === undefined) continue; // A transform update without a submitted render never completes a probe.
    const x = number(current.data['x'])!,
      z = number(current.data['z'])!;
    const px = number(previous.data['x'])!,
      pz = number(previous.data['z'])!;
    if (![x, z, px, pz].every(Number.isFinite)) throw new Error('Invalid presentation position');
    anchor ??= { x: px, z: pz };
    const dx = x - px,
      dz = z - pz;
    if (attempt.operation === 'release') {
      const remaining = options.releaseComponentOnly && length > 0 ? Math.abs((dx * attempt.direction.x + dz * attempt.direction.z) / length) : Math.hypot(dx, dz);
      if (remaining <= epsilon) stationary.push({ now, x, z });
      else stationary = [];
      if (stationary.length < (options.stationaryFrames ?? 3)) continue;
      result.responseAt = stationary[0].now;
      const stopX = stationary[0].x - anchor.x, stopZ = stationary[0].z - anchor.z;
      result.stoppingDistance = options.releaseComponentOnly && length > 0 ? Math.abs((stopX * attempt.direction.x + stopZ * attempt.direction.z) / length) : Math.hypot(stopX, stopZ);
    } else {
      if ((dx * attempt.direction.x + dz * attempt.direction.z) / length <= epsilon) continue;
      result.responseAt = now;
    }
    result.latencyMs = result.responseAt - raw.now;
    result.status = 'completed';
    return result;
  }
  result.reason = 'No confirmed corresponding submitted movement frame';
  return expire(result, options);
}

function expire(
  result: ProbeResult,
  options: { windowEndedAt?: number; timeoutMs?: number },
): ProbeResult {
  if (
    result.observedAt !== null &&
    options.windowEndedAt !== undefined &&
    options.windowEndedAt - result.observedAt >= (options.timeoutMs ?? 2000)
  )
    result.status = 'timed-out';
  return result;
}
