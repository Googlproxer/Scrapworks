import type { BuildingView, GridCell, WorldDefinition, WorldPosition } from '@contracts/world';
import { circleOverlapsCell } from '@core/world-grid';
import {
  FIXED_STEP_SECONDS,
  occupiedCells,
  PLAYER_RADIUS,
  SPRINT_SPEED,
  WALK_SPEED,
} from './world-rules';
import type { PlayerState } from './world-state';

export interface MovementIntent {
  readonly x: number;
  readonly z: number;
  readonly sprint: boolean;
}

/** Authoritative player motion in gameplay metres, with no scene or input-device dependencies. */
export class PlayerMotor {
  private readonly definition: WorldDefinition;
  private readonly player: PlayerState;
  private readonly buildings: readonly BuildingView[] | (() => readonly GridCell[]);

  constructor(
    definition: WorldDefinition,
    player: PlayerState,
    buildings: readonly BuildingView[] | (() => readonly GridCell[]),
  ) {
    this.definition = definition;
    this.player = player;
    this.buildings = buildings;
    if (!this.canOccupy(player.position))
      throw new Error('Player spawn has no footprint clearance');
  }

  public clearInput(): void {
    this.player.moving = false;
    this.player.sprinting = false;
  }

  public step(movement: MovementIntent): void {
    const length = Math.hypot(movement.x, movement.z);
    const normalized = Number.isFinite(length) && length > 0;
    const distance = (movement.sprint ? SPRINT_SPEED : WALK_SPEED) * FIXED_STEP_SECONDS;
    const dx = normalized ? (movement.x / Math.max(1, length)) * distance : 0;
    const dz = normalized ? (movement.z / Math.max(1, length)) * distance : 0;
    const previous = this.player.position;
    // Axis-separated movement slides along footprint edges without tunnelling at the fixed speed.
    const nextX = { ...this.player.position, x: this.player.position.x + dx };
    if (this.canOccupy(nextX)) this.player.position = nextX;
    const nextZ = { ...this.player.position, z: this.player.position.z + dz };
    if (this.canOccupy(nextZ)) this.player.position = nextZ;
    this.player.moving =
      this.player.position.x !== previous.x || this.player.position.z !== previous.z;
    this.player.sprinting = this.player.moving && movement.sprint;
    if (this.player.moving)
      this.player.facing = Math.atan2(
        this.player.position.x - previous.x,
        this.player.position.z - previous.z,
      );
  }

  private canOccupy(position: WorldPosition): boolean {
    const { origin, columns, rows, metresPerCell } = this.definition.grid;
    if (
      position.x - PLAYER_RADIUS < origin.x ||
      position.z - PLAYER_RADIUS < origin.z ||
      position.x + PLAYER_RADIUS > origin.x + columns * metresPerCell ||
      position.z + PLAYER_RADIUS > origin.z + rows * metresPerCell
    )
      return false;
    const cells =
      typeof this.buildings === 'function' ? this.buildings() : this.legacyCells(this.buildings);
    return !cells.some((cell) =>
      circleOverlapsCell(this.definition.grid, position, PLAYER_RADIUS, cell),
    );
  }

  private legacyCells(buildings: readonly BuildingView[]): GridCell[] {
    const { columns, rows } = this.definition.grid;
    const cells = occupiedCells(this.definition, buildings);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (this.definition.terrain[row * columns + column] === 'water')
          cells.push({ row, column });
      }
    }
    return cells;
  }
}
