import type { CollisionShape, QuarterTurn, WorldPosition } from './world';

export const RAPIER_VERSION = '0.21.0';

export interface WorldRotation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** Authored metres; position is the body's centre, independent of building footprints. */
export interface PhysicsBodyDefinition {
  readonly id: string;
  readonly position: WorldPosition;
  readonly rotation: QuarterTurn;
  readonly collision: CollisionShape;
  readonly motion: 'dynamic' | 'kinematic';
  readonly mass: number;
  readonly travel?: {
    readonly axis: 'x' | 'z';
    readonly distance: number;
    readonly periodTicks: number;
  };
}

export interface PhysicsBodyView {
  readonly id: string;
  readonly position: WorldPosition;
  readonly rotation: WorldRotation;
  readonly collision: CollisionShape;
  readonly motion: PhysicsBodyDefinition['motion'];
}

/** Engine-owned bytes plus stable IDs in native iteration order; no exposed native handles. */
export interface PhysicsSnapshot {
  readonly format: 2;
  readonly engine: 'rapier3d';
  readonly engineVersion: string;
  readonly bytes: readonly number[];
  readonly bodyIds: readonly string[];
  readonly verticalVelocity: number;
}
