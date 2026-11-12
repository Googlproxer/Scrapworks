import type { WorldDefinition, WorldPosition } from '../../src/contracts/world.ts';
import type {
  PhysicsBodyDefinition,
  PhysicsSnapshot,
  WorldRotation,
} from '../../src/contracts/physics.ts';
import type { NamedCollider } from '../../src/simulation/physics/world-physics.ts';

export const PHYSICS_PROTOCOL = 1;
export interface Motion {
  x: number;
  z: number;
  tick: number;
}
export interface BodyPose {
  id: string;
  position: WorldPosition;
  rotation: WorldRotation;
  sleeping: boolean;
}
export type ColliderDelta =
  | { kind: 'static'; set: NamedCollider[]; remove: string[]; order: string[] }
  | { kind: 'bodies'; set: PhysicsBodyDefinition[]; remove: string[]; order: string[] };
export interface PhysicsEnvelope {
  protocol: 1;
  id: number;
  generation: number;
  /** Completed boundary, not the zero-based argument to the character controller. */
  tick: number;
  substepTarget: number;
  colliderRevision: number;
}
export type PhysicsRequest = PhysicsEnvelope & {
  operation: 'initialize' | 'tick' | 'flush' | 'capture';
  deltas: ColliderDelta[];
  motion?: Motion;
  initial?: {
    definition: WorldDefinition;
    playerId: string;
    position: WorldPosition;
    snapshot?: PhysicsSnapshot;
    clearance: boolean;
    restored?: {
      position: WorldPosition;
      bodies: { id: string; position: WorldPosition; rotation: WorldRotation }[];
    };
  };
};
export type PhysicsReply = PhysicsEnvelope & {
  ok: boolean;
  error?: string;
  position?: WorldPosition;
  poses?: BodyPose[];
  snapshot?: PhysicsSnapshot;
  diagnostics?: unknown;
};

export function validatePhysicsEnvelope(value: PhysicsEnvelope): void {
  if (
    value.protocol !== PHYSICS_PROTOCOL ||
    ![value.id, value.generation, value.tick, value.substepTarget, value.colliderRevision].every(
      (number) => Number.isSafeInteger(number) && number >= 0,
    ) ||
    value.substepTarget !== value.tick * 3
  )
    throw new Error('Invalid physics generation/tick/substep/revision envelope');
}

export function requireMatchingReply(request: PhysicsRequest, reply: PhysicsReply): void {
  validatePhysicsEnvelope(reply);
  for (const key of ['id', 'generation', 'tick', 'substepTarget', 'colliderRevision'] as const)
    if (reply[key] !== request[key]) throw new Error(`Mismatched physics reply ${key}`);
  if (!reply.ok) throw new Error(reply.error ?? 'Physics worker failed');
  const position = (value: WorldPosition) =>
    value && [value.x, value.y, value.z].every(Number.isFinite);
  if (request.operation === 'tick') {
    if (
      !reply.position ||
      !position(reply.position) ||
      !Array.isArray(reply.poses) ||
      reply.poses.length > 250000
    )
      throw new Error('Invalid resolved physics poses');
    const ids = new Set<string>();
    for (const pose of reply.poses) {
      if (
        typeof pose.id !== 'string' ||
        ids.has(pose.id) ||
        !position(pose.position) ||
        !pose.rotation ||
        ![pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w].every(
          Number.isFinite,
        ) ||
        typeof pose.sleeping !== 'boolean'
      )
        throw new Error('Invalid/duplicate resolved body pose');
      ids.add(pose.id);
    }
  }
  if (
    request.operation === 'capture' &&
    (!reply.snapshot ||
      reply.snapshot.format !== 3 ||
      !Array.isArray(reply.snapshot.bytes) ||
      !reply.snapshot.bytes.length ||
      reply.snapshot.bytes.length > 67108864 ||
      !reply.snapshot.bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
  )
    throw new Error('Invalid native physics capture');
}
