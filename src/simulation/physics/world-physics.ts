import type { WorldDefinition, WorldPosition } from '@contracts/world';
import type { PhysicsBodyDefinition, PhysicsSnapshot, WorldRotation } from '@contracts/physics';
import { requireInvariant as check } from '@contracts/simulation';
import type { WorldCollider } from '@core/world-collision';
import { FIXED_STEP_SECONDS, PLAYER_RADIUS } from '../world-rules';
import { PHYSICS_ENGINE_VERSION, RAPIER } from './rapier';
import { assertFixedPose, assertRestoredBody } from './snapshot-validation';

export const PHYSICS_SUBSTEPS = 3;

export const PLAYER_HEIGHT = 1.7;

export const COLLISION_SKIN = 0.002;

const STEP = FIXED_STEP_SECONDS / PHYSICS_SUBSTEPS;
// Rapier 0.21's character controller predicts platform contacts beyond its offset.
const PLATFORM_CONTACT_PREDICTION = 0.05;
const identity = { x: 0, y: 0, z: 0, w: 1 };

export type NamedCollider = WorldCollider & {
  readonly source: 'entity' | 'terrain';
  readonly id: string;
};

/** One simulation-owned physics backend. Native handles never leave this module. */
export class WorldPhysics {
  private readonly world: RAPIER.World;
  private readonly bodies = new Map<string, RAPIER.RigidBody>();
  private readonly bodyKeys = new Map<number, string>();
  private readonly kinematics = new Map<string, PhysicsBodyDefinition>();
  private previousActive = new Set<string>();
  private readonly fixedKeys = new Map<string, string>();
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly player: RAPIER.RigidBody;
  private readonly playerCollider: RAPIER.Collider;
  private verticalVelocity = 0;
  private disposed = false;
  private restoring = false;
  private restoringActors = false;
  private readonly playerKey: string;

  public constructor(
    definition: WorldDefinition,
    playerId: string,
    position: WorldPosition,
    snapshot?: PhysicsSnapshot,
  ) {
    this.playerKey = `player:${playerId}`;
    this.restoring = !!snapshot;
    this.restoringActors = !!snapshot;
    this.world = snapshot
      ? RAPIER.World.restoreSnapshot(Uint8Array.from(snapshot.bytes))
      : new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    check(this.world, 'Invalid Rapier snapshot bytes');
    try {
      if (snapshot) {
        check(
          snapshot.format === 3 && snapshot.engineVersion === PHYSICS_ENGINE_VERSION,
          'Unsupported Rapier snapshot version',
        );
        let index = 0;
        this.world.forEachRigidBody((body) => {
          const id = snapshot.bodyIds[index++];
          check(id && !this.bodies.has(id), 'Invalid physics body identity');
          this.bodies.set(id, body);
          this.bodyKeys.set(body.handle, id);
        });
        check(index === snapshot.bodyIds.length, 'Physics snapshot population mismatch');
        this.verticalVelocity = snapshot.verticalVelocity;
        check(
          this.world.gravity.x === 0 &&
            Math.abs(this.world.gravity.y + 9.81) < 0.00001 &&
            this.world.gravity.z === 0 &&
            Math.abs(this.world.timestep - STEP) < 0.000001,
          'Physics snapshot/world configuration mismatch',
        );
      } else this.world.timestep = STEP;
      const { origin, columns, rows, metresPerCell } = definition.grid;
      const width = columns * metresPerCell;
      const depth = rows * metresPerCell;
      const cx = origin.x + width / 2;
      const cz = origin.z + depth / 2;
      this.fixed(
        'floor',
        { x: 0, y: 0, z: 0 },
        new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })),
      );
      for (const [id, x, z, w, d] of [
        ['west', origin.x - 0.5, cz, 1, depth + 2],
        ['east', origin.x + width + 0.5, cz, 1, depth + 2],
        ['south', cx, origin.z - 0.5, width + 2, 1],
        ['north', cx, origin.z + depth + 0.5, width + 2, 1],
      ] as const)
        this.fixed(`boundary:${id}`, { x, y: 5, z }, RAPIER.ColliderDesc.cuboid(w / 2, 5, d / 2));
      if (!snapshot) {
        const player = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(position.x, position.y + PLAYER_HEIGHT / 2 + 0.01, position.z)
            .lockRotations(),
        );
        this.bodies.set(`player:${playerId}`, player);
        this.bodyKeys.set(player.handle, `player:${playerId}`);
        this.world.createCollider(
          RAPIER.ColliderDesc.capsule(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS),
          player,
        );
      }
      const player = this.bodies.get(`player:${playerId}`);
      check(player && player.numColliders() === 1, 'Missing physics player');
      this.player = player;
      this.playerCollider = player.collider(0);
      if (snapshot) {
        assertRestoredBody(
          player,
          RAPIER.RigidBodyType.KinematicPositionBased,
          RAPIER.ColliderDesc.capsule(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS),
        );
        const rotation = player.rotation();
        check(
          Math.hypot(rotation.x, rotation.y, rotation.z) < 0.00001 &&
            Math.abs(rotation.w - 1) < 0.00001,
          'Physics snapshot/player rotation mismatch',
        );
      }
      this.controller = this.world.createCharacterController(COLLISION_SKIN);
      this.controller.setSlideEnabled(true);
      this.controller.setCharacterMass(70);
      this.controller.setApplyImpulsesToDynamicBodies(true);
      this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
      this.world.propagateModifiedBodyPositionsToColliders();
    } catch (error) {
      this.world.free();
      throw error;
    }
  }

  private shape(shape: PhysicsBodyDefinition['collision']): RAPIER.ColliderDesc {
    return shape.shape === 'box'
      ? RAPIER.ColliderDesc.cuboid(shape.width / 2, shape.height / 2, shape.depth / 2)
      : RAPIER.ColliderDesc.cylinder(shape.height / 2, shape.radius);
  }

  private fixed(id: string, position: WorldPosition, shape: RAPIER.ColliderDesc): void {
    if (this.restoring) {
      const body = this.bodies.get(id);
      assertRestoredBody(body, RAPIER.RigidBodyType.Fixed, shape);
      assertFixedPose(body, position);
      return;
    }
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    this.world.createCollider(shape, body);
    this.bodies.set(id, body);
    this.bodyKeys.set(body.handle, id);
  }

  /** Reconcile physical components only at an ECS structural boundary. */
  public syncBodies(sources: Iterable<PhysicsBodyDefinition>): void {
    const retained = new Set<string>();
    for (const source of sources) {
      const key = `entity:${source.id}`;
      retained.add(key);
      if (source.motion === 'kinematic') this.kinematics.set(source.id, source);
      if (this.bodies.has(key)) {
        if (this.restoringActors)
          assertRestoredBody(
            this.bodies.get(key),
            source.motion === 'dynamic'
              ? RAPIER.RigidBodyType.Dynamic
              : RAPIER.RigidBodyType.KinematicVelocityBased,
            this.shape(source.collision).setMass(source.mass).setFriction(0.6),
            source.motion === 'dynamic',
          );
        continue;
      }
      check(!this.restoringActors, 'Physics snapshot/body component mismatch');
      const descriptor =
        source.motion === 'dynamic'
          ? RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true)
          : RAPIER.RigidBodyDesc.kinematicVelocityBased();
      const angle = (source.rotation * Math.PI) / 2;
      const body = this.world.createRigidBody(
        descriptor
          .setTranslation(source.position.x, source.position.y, source.position.z)
          .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }),
      );
      this.world.createCollider(
        this.shape(source.collision).setMass(source.mass).setFriction(0.6),
        body,
      );
      this.bodies.set(key, body);
      this.bodyKeys.set(body.handle, key);
      this.previousActive.add(source.id);
    }
    for (const [key, body] of this.bodies)
      if (key.startsWith('entity:') && !retained.has(key)) {
        check(!this.restoringActors, 'Unexpected physics snapshot body');
        this.bodyKeys.delete(body.handle);
        this.world.removeRigidBody(body);
        this.bodies.delete(key);
        this.kinematics.delete(key.slice('entity:'.length));
        this.previousActive.delete(key.slice('entity:'.length));
      }
    if (this.restoringActors)
      for (const key of retained) this.previousActive.add(key.slice('entity:'.length));
    this.restoringActors = false;
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  public syncStatic(colliders: readonly NamedCollider[]): void {
    check(!this.disposed, 'Disposed physics world');
    const retained = new Set<string>();
    for (const collider of colliders) {
      const key = `solid:${collider.source}:${collider.id}`;
      const signature = JSON.stringify(collider);
      check(!retained.has(key), 'Duplicate static collider identity');
      retained.add(key);
      if (this.restoring) this.fixed(key, collider.center, this.shape(collider));
      if (this.fixedKeys.has(key) && this.fixedKeys.get(key) !== signature) {
        this.bodyKeys.delete(this.bodies.get(key)!.handle);
        this.world.removeRigidBody(this.bodies.get(key)!);
        this.bodies.delete(key);
      }
      if (!this.bodies.has(key)) this.fixed(key, collider.center, this.shape(collider));
      this.fixedKeys.set(key, signature);
    }
    for (const [key, body] of this.bodies)
      if (key.startsWith('solid:') && !retained.has(key)) {
        check(!this.restoring, 'Unexpected physics snapshot solid');
        this.bodyKeys.delete(body.handle);
        this.world.removeRigidBody(body);
        this.bodies.delete(key);
        this.fixedKeys.delete(key);
      }
    this.world.propagateModifiedBodyPositionsToColliders();
    this.restoring = false;
  }

  public assertRestoredState(
    position: WorldPosition,
    poses: readonly { id: string; position: WorldPosition; rotation: WorldRotation }[],
  ): void {
    const expected = new Set([
      'floor',
      'boundary:west',
      'boundary:east',
      'boundary:south',
      'boundary:north',
      this.playerKey,
      ...this.fixedKeys.keys(),
      ...poses.map((pose) => `entity:${pose.id}`),
    ]);
    check(
      this.bodies.size === expected.size &&
        this.world.colliders.len() === expected.size &&
        Array.from(this.bodies.keys()).every((id) => expected.has(id)),
      'Physics snapshot identity mismatch',
    );
    const p = this.player.translation();
    check(
      Math.abs(p.x - position.x) < 0.00001 &&
        Math.abs(p.z - position.z) < 0.00001 &&
        Math.abs(p.y - PLAYER_HEIGHT / 2 - COLLISION_SKIN - position.y) < 0.02,
      'Physics snapshot/player pose mismatch',
    );
    for (const expectedPose of poses) {
      const actual = this.pose(expectedPose.id);
      check(
        Math.hypot(
          actual.position.x - expectedPose.position.x,
          actual.position.y - expectedPose.position.y,
          actual.position.z - expectedPose.position.z,
        ) < 0.00001 &&
          Math.hypot(
            actual.rotation.x - expectedPose.rotation.x,
            actual.rotation.y - expectedPose.rotation.y,
            actual.rotation.z - expectedPose.rotation.z,
            actual.rotation.w - expectedPose.rotation.w,
          ) < 0.00001,
        'Physics snapshot/entity pose mismatch',
      );
    }
  }

  public assertClearance(): void {
    const position = this.player.translation();
    this.world.colliders.forEach((collider) => {
      if (collider.handle === this.playerCollider.handle) return;
      const contact = collider.contactShape(this.playerCollider.shape, position, identity, 0);
      check(!contact || contact.distance >= -0.00001, 'Player spawn has no collision clearance');
    });
  }

  public movePlayer(x: number, z: number, tick: number): WorldPosition {
    check(!this.disposed, 'Disposed physics world');
    for (let substep = 0; substep < PHYSICS_SUBSTEPS; substep++) {
      for (const source of this.kinematics.values()) {
        if (!source.travel) continue;
        const body = this.bodies.get(`entity:${source.id}`)!;
        const phase =
          ((tick + (substep + 1) / PHYSICS_SUBSTEPS) % source.travel.periodTicks) /
          source.travel.periodTicks;
        const offset = (1 - Math.abs(phase * 2 - 1)) * source.travel.distance;
        const target = {
          ...source.position,
          [source.travel.axis]: source.position[source.travel.axis] + offset,
        };
        const position = body.translation();
        body.setLinvel(
          {
            x: (target.x - position.x) / STEP,
            y: (target.y - position.y) / STEP,
            z: (target.z - position.z) / STEP,
          },
          false,
        );
      }
      this.verticalVelocity -= 9.81 * STEP;
      this.computePlayerMovement({
        x: x / PHYSICS_SUBSTEPS,
        y: this.verticalVelocity * STEP,
        z: z / PHYSICS_SUBSTEPS,
      });
      const movement = this.controller.computedMovement();
      const previous = this.player.translation();
      this.player.setNextKinematicTranslation({
        x: previous.x + movement.x,
        y: previous.y + movement.y,
        z: previous.z + movement.z,
      });
      if (this.controller.computedGrounded()) this.verticalVelocity = 0;
      this.world.step();
    }
    const position = this.player.translation();
    const feet = position.y - PLAYER_HEIGHT / 2 - COLLISION_SKIN;
    return { x: position.x, y: Math.abs(feet) < 0.02 ? 0 : feet, z: position.z };
  }

  /** Rapier resolves collisions; this adapter limits automatic carrying to walkable support. */
  private computePlayerMovement(desired: RAPIER.Vector): void {
    const contacts: {
      body: RAPIER.RigidBody;
      linear: RAPIER.Vector;
      angular: RAPIER.Vector;
      contact: RAPIER.ShapeContact;
      velocity: RAPIER.Vector;
    }[] = [];
    const prediction =
      COLLISION_SKIN + PLATFORM_CONTACT_PREDICTION + Math.hypot(desired.x, desired.y, desired.z);
    try {
      for (const source of this.kinematics.values()) {
        const body = this.bodies.get(`entity:${source.id}`)!;
        const contact = body.collider(0).contactCollider(this.playerCollider, prediction);
        if (!contact) continue;
        contacts.push({
          body,
          contact,
          linear: body.linvel(),
          angular: body.angvel(),
          velocity: body.velocityAtPoint(contact.point1),
        });
      }

      const dot = (a: RAPIER.Vector, b: RAPIER.Vector) => a.x * b.x + a.y * b.y + a.z * b.z;

      const support = contacts
        .filter(
          ({ contact }) =>
            contact.normal1.y >= Math.cos(this.controller.maxSlopeClimbAngle()) &&
            contact.distance <= COLLISION_SKIN + Math.max(0, -dot(desired, contact.normal1)),
        )
        .sort((a, b) => a.contact.distance - b.contact.distance)[0];
      if (support) {
        // Supply support transport as input: native friction alone can miss substeps when
        // the character's downward cast starts inside the contact margin.
        const {
          velocity,
          contact: { normal1: n },
        } = support;
        const normalSpeed = dot(velocity, n);
        desired = {
          x: desired.x + (velocity.x - n.x * normalSpeed) * STEP,
          y: desired.y + (velocity.y - n.y * normalSpeed) * STEP,
          z: desired.z + (velocity.z - n.z * normalSpeed) * STEP,
        };
        const separation =
          COLLISION_SKIN + this.controller.normalNudgeFactor() - support.contact.distance;
        const correction = Math.max(0, separation - dot(desired, n));
        desired = {
          x: desired.x + n.x * correction,
          y: desired.y + n.y * correction,
          z: desired.z + n.z * correction,
        };
      }
      for (const entry of contacts) {
        const { body, contact, velocity } = entry;
        const normal = contact.normal1;
        let speed = dot(velocity, normal);
        if (entry !== support) {
          // A nearby corner is not a push until the surface can reach the capsule this step.
          speed = contact.distance <= COLLISION_SKIN + speed * STEP ? Math.max(0, speed) : 0;
          const push = Math.max(0, speed * STEP - Math.max(0, contact.distance - COLLISION_SKIN));
          const correction = push > 0 ? Math.max(0, push - dot(desired, normal)) : 0;
          desired = {
            x: desired.x + normal.x * correction,
            y: desired.y + normal.y * correction,
            z: desired.z + normal.z * correction,
          };
          // Preserve movement into or away from a stationary/receding surface. The native
          // shape cast enforces the surface; its predictive friction must not stop input early.
          const requestedSpeed = dot(desired, normal) / STEP;
          speed = speed > 0 ? Math.max(speed, requestedSpeed) : requestedSpeed;
        }
        // Native friction also carries side contacts. Expose only normal motion to the
        // character query; restore full velocities before the native dynamics step.
        body.setLinvel({ x: normal.x * speed, y: normal.y * speed, z: normal.z * speed }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      }
      this.controller.computeColliderMovement(this.playerCollider, desired);
    } finally {
      for (const { body, linear, angular } of contacts) {
        body.setLinvel(linear, false);
        body.setAngvel(angular, false);
      }
    }
  }

  public pose(id: string): { position: WorldPosition; rotation: WorldRotation; sleeping: boolean } {
    const body = this.bodies.get(`entity:${id}`);
    check(body, 'Missing physics body');
    return { position: body.translation(), rotation: body.rotation(), sleeping: body.isSleeping() };
  }

  /** Include last frame's active set so the final pose of a body falling asleep is published. */
  public changedBodies(): Iterable<string> {
    const active = new Set<string>();
    this.world.forEachActiveRigidBody((body) => {
      const key = this.bodyKeys.get(body.handle);
      if (key?.startsWith('entity:')) active.add(key.slice('entity:'.length));
    });
    const changed = new Set([...active, ...this.previousActive]);
    this.previousActive = active;
    return changed;
  }

  public capture(): PhysicsSnapshot {
    check(!this.disposed, 'Disposed physics world');
    const ids = new Map(Array.from(this.bodies, ([id, body]) => [body.handle, id]));
    const bodyIds: string[] = [];
    this.world.forEachRigidBody((body) => {
      const id = ids.get(body.handle);
      check(id, 'Missing stable physics identity');
      bodyIds.push(id);
    });
    return {
      format: 3,
      engine: 'rapier3d',
      engineVersion: PHYSICS_ENGINE_VERSION,
      bytes: Array.from(this.world.takeSnapshot()),
      bodyIds,
      verticalVelocity: this.verticalVelocity,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bodies.clear();
    this.bodyKeys.clear();
    this.kinematics.clear();
    this.previousActive.clear();
    this.fixedKeys.clear();
    this.world.free();
  }
}
