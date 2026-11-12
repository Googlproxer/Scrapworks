import type { TraceEvent } from './browser-probe.ts';
import type { ProbeResult } from './detector.ts';
import { distribution } from './statistics.ts';
interface Pose { frame: number; now: number; tick: number; generation: number; x: number; z: number; facing: number; clip: string; camera?: { x: number; z: number } }
interface Detail { result: ProbeResult; anchor?: Pose; facingMs: number | null; clipMs: number | null; cameraMs: number | null; stableReverseMs: number | null; positive: number[]; cameraStill: number[]; wrongDirectionMetres: number; lastWrongMs: number }
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** Retrospective companion endpoints. Movement qualification remains owned by detector.ts. */
export class ResponseDetails {
  private readonly results: Map<number, ProbeResult>;
  private readonly details = new Map<number, Detail>();
  private readonly active = new Set<Detail>();
  private pending?: TraceEvent;
  private camera?: TraceEvent;
  private previous?: Pose;
  private readonly frameDisplacements: number[] = [];
  private readonly frameSpeeds: number[] = [];
  private readonly authoritativeLag: number[] = [];
  constructor(results: readonly ProbeResult[]) { this.results = new Map(results.map(result => [result.id, result])); }
  public consume(event: TraceEvent): void {
    if (event.realm !== 'main') return;
    if (event.stage === 'raw-keyboard' || event.stage === 'raw-gamepad') {
      const result = this.results.get(Number(event.data['probeId']));
      if (!result || result.observedAt !== event.now || this.details.has(result.id)) return;
      const detail: Detail = { result, anchor: this.previous, facingMs: null, clipMs: null, cameraMs: null, stableReverseMs: null, positive: [], cameraStill: [], wrongDirectionMetres: 0, lastWrongMs: 0 };
      this.details.set(result.id, detail); this.active.add(detail); return;
    }
    if (event.stage === 'camera') { this.camera = event; return; }
    if (event.stage === 'present') { this.pending = event; return; }
    if (event.stage !== 'frame-submitted' || this.pending?.frame !== event.frame) return;
    const data = this.pending.data, target = this.camera?.frame === event.frame ? this.camera.data['target'] as { x: number; z: number } | undefined : undefined;
    const pose: Pose = { frame: event.frame, now: event.now, tick: Number(data['tick']), generation: Number(data['generation']), x: Number(data['x']), z: Number(data['z']), facing: Number(data['facing']), clip: String(data['clip']), camera: target ? { x: target.x / 100, z: target.z / 100 } : undefined };
    const previous = this.previous; this.previous = pose;
    if (!previous) return;
    if (previous.generation === pose.generation && pose.now > previous.now) { const distance = Math.hypot(pose.x - previous.x, pose.z - previous.z); this.frameDisplacements.push(distance); this.frameSpeeds.push(distance * 1000 / (pose.now - previous.now)); }
    const endpoint = (data['endpoints'] as { transform: { position: { x: number; z: number } } }[] | undefined)?.at(-1);
    if (endpoint) this.authoritativeLag.push(Math.hypot(pose.x - endpoint.transform.position.x, pose.z - endpoint.transform.position.z));
    for (const detail of this.active) {
      const result = detail.result, observed = result.observedAt!;
      if (pose.now - observed > 2000) { this.active.delete(detail); continue; }
      if (pose.generation !== result.generation || previous.generation !== result.generation) continue;
      const length = Math.hypot(result.direction.x, result.direction.z), projection = length ? ((pose.x - previous.x) * result.direction.x + (pose.z - previous.z) * result.direction.z) / length : 0;
      if (result.operation === 'reverse' && pose.now <= (result.responseAt ?? observed + 2000) && projection < -.0001) { detail.wrongDirectionMetres -= projection; detail.lastWrongMs = pose.now - observed; }
      if (result.tick === null || result.submittedAt === null || pose.tick < result.tick || pose.now < result.submittedAt) continue;
      if (result.operation !== 'release' && detail.anchor && detail.facingMs === null) {
        const desired = Math.atan2(result.direction.x, result.direction.z);
        if (angle(detail.anchor.facing, desired) - angle(pose.facing, desired) > .001) detail.facingMs = pose.now - observed;
      }
      const expectedClip = result.operation === 'release' ? 'Idle' : 'Walk';
      if (detail.clipMs === null && detail.anchor?.clip !== expectedClip && pose.clip === expectedClip) detail.clipMs = pose.now - observed;
      if (result.operation === 'reverse' && detail.stableReverseMs === null) {
        if (projection > .0001) detail.positive.push(pose.now); else detail.positive = [];
        if (detail.positive.length >= 3) detail.stableReverseMs = detail.positive[0] - observed;
      }
      if (detail.cameraMs === null && pose.camera && previous.camera) {
        const dx = pose.camera.x - previous.camera.x, dz = pose.camera.z - previous.camera.z;
        if (result.operation === 'release') {
          if (Math.hypot(dx, dz) <= .0001) detail.cameraStill.push(pose.now); else detail.cameraStill = [];
          if (detail.cameraStill.length >= 3) detail.cameraMs = detail.cameraStill[0] - observed;
        } else if (length && (dx * result.direction.x + dz * result.direction.z) / length > .0001) detail.cameraMs = pose.now - observed;
      }
    }
  }
  public report() {
    const probes = [...this.details.values()].map(detail => ({ id: detail.result.id, operation: detail.result.operation, status: detail.result.status, rawToSubmissionMs: detail.result.submittedAt === null ? null : detail.result.submittedAt - detail.result.observedAt!, submissionToMovementMs: detail.result.responseAt === null || detail.result.submittedAt === null ? null : detail.result.responseAt - detail.result.submittedAt, facingMs: detail.facingMs, facingAlreadyAligned: detail.anchor && detail.result.operation !== 'release' ? angle(detail.anchor.facing, Math.atan2(detail.result.direction.x, detail.result.direction.z)) <= .001 : null, clipMs: detail.clipMs, priorClip: detail.anchor?.clip, cameraMs: detail.cameraMs, stableReverseMs: detail.stableReverseMs, wrongDirectionMetres: detail.wrongDirectionMetres, wrongDirectionDurationMs: detail.lastWrongMs, stoppingDistanceMetres: detail.result.stoppingDistance }));
    const metrics = ['rawToSubmissionMs', 'submissionToMovementMs', 'facingMs', 'clipMs', 'cameraMs', 'stableReverseMs', 'wrongDirectionMetres', 'wrongDirectionDurationMs', 'stoppingDistanceMetres'] as const;
    return { probes, frameDisplacementMetres: distribution(this.frameDisplacements), frameSpeedMetresPerSecond: distribution(this.frameSpeeds), lagFromLatestAuthoritativeEndpointMetres: distribution(this.authoritativeLag), operations: Object.fromEntries(['start', 'reverse', 'release'].map(operation => [operation, Object.fromEntries(metrics.map(metric => [metric, distribution(probes.filter(probe => probe.operation === operation && typeof probe[metric] === 'number').map(probe => probe[metric] as number))]))])), limitations: 'Facing/clip endpoints require an actual change; already-aligned or unchanged controls remain null. Stable reverse requires three consecutive submitted displacements. Camera uses world-space target motion. Frame displacement/speed and authoritative lag describe presentation variation, not a fabricated prediction-correction metric. These companions do not replace the causal movement endpoint or qualify support-relative contact response.' };
  }
}
