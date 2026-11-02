import { FIXED_STEP_SECONDS, SPRINT_SPEED, WALK_SPEED } from './world-rules';
import type { PlayerState } from './world-state';
import type { WorldPhysics } from './physics/world-physics';

export interface MovementIntent {
  readonly x: number;
  readonly z: number;
  readonly sprint: boolean;
}

/** Gameplay intent/animation state; Rapier owns collision and contact response. */
export class PlayerMotor {
  private readonly player: PlayerState;
  private readonly physics: WorldPhysics;

  public constructor(player: PlayerState, physics: WorldPhysics) {
    this.player = player;
    this.physics = physics;
  }

  public clearInput(): void {
    this.player.moving = false;
    this.player.sprinting = false;
  }

  public step(movement: MovementIntent, tick = 0): void {
    const length = Math.hypot(movement.x, movement.z);
    const normalized = Number.isFinite(length) && length > 0;
    const distance = (movement.sprint ? SPRINT_SPEED : WALK_SPEED) * FIXED_STEP_SECONDS;
    const dx = normalized ? (movement.x / Math.max(1, length)) * distance : 0;
    const dz = normalized ? (movement.z / Math.max(1, length)) * distance : 0;
    const previous = this.player.position;
    this.player.position = this.physics.movePlayer(dx, dz, tick);
    const actualX = this.player.position.x - previous.x;
    const actualZ = this.player.position.z - previous.z;
    // Ignore sub-millimetre contact corrections when choosing locomotion/facing.
    this.player.moving = Math.hypot(actualX, actualZ) > 0.0001;
    this.player.sprinting = this.player.moving && movement.sprint;
    if (this.player.moving) this.player.facing = Math.atan2(actualX, actualZ);
  }
}
