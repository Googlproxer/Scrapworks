import { WorldPhysics } from '../../src/simulation/physics/world-physics.ts';
import type { NamedCollider } from '../../src/simulation/physics/world-physics.ts';
import type { PhysicsBodyDefinition } from '../../src/contracts/physics.ts';
import { validatePhysicsEnvelope } from './physics-protocol.ts';
import type { PhysicsRequest, PhysicsReply } from './physics-protocol.ts';

let world: WorldPhysics | undefined;
let generation = -1,
  tick = 0,
  revision = 0,
  lastId = 0;
const statics = new Map<string, NamedCollider>();
const bodies = new Map<string, PhysicsBodyDefinition>();
export function handlePhysics(request: PhysicsRequest): PhysicsReply {
  const envelope = {
    protocol: 1 as const,
    id: request.id,
    generation: request.generation,
    tick: request.tick,
    substepTarget: request.substepTarget,
    colliderRevision: request.colliderRevision,
  };
  try {
    validatePhysicsEnvelope(request);
    if (request.id !== lastId + 1) throw new Error('Physics request gap/duplicate');
    if (request.operation === 'initialize') {
      if (world || !request.initial) throw new Error('Invalid physics initialization');
      const initial = request.initial;
      world = new WorldPhysics(
        initial.definition,
        initial.playerId,
        initial.position,
        initial.snapshot,
      );
      generation = request.generation;
      tick = request.tick;
    }
    if (!world || request.generation !== generation) throw new Error('Stale physics world');
    if (request.tick !== tick + (request.operation === 'tick' ? 1 : 0))
      throw new Error('Physics tick mismatch');
    if (
      request.colliderRevision !== revision + request.deltas.length ||
      request.deltas.length > 1024
    )
      throw new Error('Physics collider revision gap');
    for (const delta of request.deltas) {
      if (delta.kind === 'static') {
        for (const id of delta.remove) statics.delete(id);
        for (const value of delta.set) statics.set(`${value.source}:${value.id}`, value);
        world.syncStatic(
          delta.order.map((id) => {
            const value = statics.get(id);
            if (!value) throw new Error('Missing static delta identity');
            return value;
          }),
        );
      } else {
        for (const id of delta.remove) bodies.delete(id);
        for (const value of delta.set) bodies.set(value.id, value);
        world.syncBodies(
          delta.order.map((id) => {
            const value = bodies.get(id);
            if (!value) throw new Error('Missing body delta identity');
            return value;
          }),
        );
      }
    }
    revision = request.colliderRevision;
    lastId = request.id;
    if (request.operation === 'initialize') {
      if (request.initial!.restored)
        world.assertRestoredState(
          request.initial!.restored.position,
          request.initial!.restored.bodies,
        );
      else if (request.initial!.clearance) world.assertClearance();
    }
    if (request.operation === 'tick') {
      if (!request.motion || request.motion.tick !== tick)
        throw new Error('Missing/stale physics motion');
      const position = world.movePlayer(request.motion.x, request.motion.z, tick);
      ++tick;
      const poses = [...world.changedBodies()].map((id) => ({ id, ...world!.pose(id) }));
      return { ...envelope, ok: true, position, poses };
    }
    return {
      ...envelope,
      ok: true,
      ...(request.operation === 'capture' ? { snapshot: world.capture() } : {}),
    };
  } catch (error) {
    world?.dispose();
    world = undefined;
    return {
      ...envelope,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
