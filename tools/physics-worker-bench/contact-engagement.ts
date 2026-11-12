import type { TraceEvent } from './browser-probe.ts';

type Position = { x: number; y: number; z: number };
const position = (event: TraceEvent): Position => ({ x: Number(event.data['x']), y: Number(event.data['y']), z: Number(event.data['z']) });

/** Checks fixture engagement independently of whether an ordinary movement probe completed. */
export class ContactEngagement {
  private readonly initialBodies = new Map<string, Position>();
  private firstAction: { at: number; x: number; z: number } | undefined;
  private wall = false;
  private corner = false;
  private crateAdvance = 0;
  private denseMotion = 0;
  private platformSide = false;
  private onSupport = false;
  private idleMinX = Infinity;
  private idleMaxX = -Infinity;
  private readonly course: string;
  constructor(course: string) { this.course = course; }

  public startup(events: TraceEvent[]): void {
    for (const event of events) {
      if (event.stage === 'body-present') this.initialBodies.set(String(event.data['id']), position(event));
      if (event.stage === 'present' && Number(event.data['y']) > .55 && Number(event.data['y']) < .65) {
        this.idleMinX = Math.min(this.idleMinX, Number(event.data['x']));
        this.idleMaxX = Math.max(this.idleMaxX, Number(event.data['x']));
      }
    }
    this.geometry(events, true);
  }

  public observe(events: TraceEvent[]): void {
    const action = events.find(event => event.stage === 'action' && event.data['probeId'] === 1 && Math.hypot(Number(event.data['x']), Number(event.data['z'])) > .01);
    if (!this.firstAction && action) this.firstAction = { at: action.now, x: Number(action.data['x']), z: Number(action.data['z']) };
    this.geometry(events, false);
  }

  private geometry(events: TraceEvent[], startup: boolean): void {
    const poses = new Map(events.filter(event => event.stage === 'present' && (startup || event.data['probeId'] === 1)).map(event => [event.frame, event]));
    for (const event of poses.values()) {
      const p = position(event);
      if (p.x > 2 && p.x < 2.3 && p.z > 2) this.wall = true;
      if (p.x > 2 && p.x < 2.3 && p.z > 6 && p.z < 6.4) this.corner = true;
    }
    for (const event of events.filter(event => event.stage === 'body-present')) {
      const id = String(event.data['id']), body = position(event), pose = poses.get(event.frame), initial = this.initialBodies.get(id);
      if (!startup && event.data['probeId'] === 1 && initial) {
        if (id === 'crate') this.crateAdvance = Math.max(this.crateAdvance, body.z - initial.z);
        if (id === 'dense-2') this.denseMotion = Math.max(this.denseMotion, Math.hypot(body.x - initial.x, body.z - initial.z));
      }
      if (id === 'mover' && pose) {
        const p = position(pose);
        if (p.y > .55 && p.y < .65 && Math.abs(p.x - body.x) < 4 && Math.abs(p.z - body.z) < 4) this.onSupport = true;
        if (!startup && this.firstAction && event.now > this.firstAction.at + 500 && Math.abs(p.x - body.x) < 1.15 && p.z - body.z > -1.3 && p.z - body.z < -.9) this.platformSide = true;
      }
    }
  }

  public report() {
    const forward = !!this.firstAction && this.firstAction.z > .5;
    const idleCarryingMetres = Number.isFinite(this.idleMinX) ? this.idleMaxX - this.idleMinX : 0;
    const conditions: Record<string, boolean> = {
      'free-space': !!this.firstAction && this.firstAction.x > .5 && Math.abs(this.firstAction.z) < .01,
      'wall-corner': forward && this.wall,
      'corner-contact': forward && this.corner,
      'crate-contact': forward && this.crateAdvance > .3,
      'dense-contacts': forward && this.denseMotion > .02,
      'platform-side': forward && this.platformSide,
      'platform-support': forward && this.onSupport && idleCarryingMetres > .5,
    };
    return { course: this.course, pass: conditions[this.course] ?? false, firstAction: this.firstAction, wall: this.wall, corner: this.corner, crateAdvanceMetres: this.crateAdvance, denseBodyMotionMetres: this.denseMotion, platformSideConstraint: this.platformSide, onSupport: this.onSupport, idleCarryingMetres, qualification: 'Production action direction and rendered geometry/body engagement. Not a native contact-event counter or physical input timing.' };
  }
}
