import { OPENING_CONTENT } from '@content/opening';
import type { EditableData } from '@contracts/readonly-data';
import type { OpeningEvent } from '@contracts/session-event';
import type {
  ContentDefinition,
  EntityData,
  EntityMapping,
  Inspection,
  PlayerEndpoint,
  PresentationPacket,
  SimulationSnapshot,
  SimulationStepResult,
  WorldResources,
} from '@contracts/simulation';
import {
  requireInvariant as check,
  MAX_DETAIL_SUBSCRIPTIONS,
  PRESENTATION_STRIDE,
} from '@contracts/simulation';
import type {
  BuildingView,
  CommandResult,
  DepositDefinition,
  WorldCommand,
  WorldDefinition,
  WorldView,
} from '@contracts/world';
import { assertWorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { World } from 'miniplex';
import { assertSnapshot, ownContent } from './capture';
import { emptyInventory } from './domain/inventory';
import { newOpening, OpeningSystem } from './opening';
import type { OpeningContext, SimulationEntity } from './opening-context';
import { staticColliders } from './physics/collision-definitions';
import { WorldPhysics } from './physics/world-physics';
import { TEST_BUILDING_FOOTPRINT, validatePlacement } from './placement';
import { PlayerMotor, type MovementIntent } from './player-motor';
import { FIXED_STEP_SECONDS } from './world-rules';
import { FactorySystem } from './factory';
import { isFactoryCommand } from '@contracts/factory';

export type { MovementIntent } from './player-motor';

export { FIXED_STEP_SECONDS, PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED } from './world-rules';

export interface SimulationOptions {
  developerFixture?: boolean;
  snapshot?: SimulationSnapshot;
}

/** One private ECS authority, pure fixed steps, no renderer, storage or clock APIs. */
export class Simulation {
  public readonly definition: WorldDefinition;
  private readonly resources: WorldResources;

  public get tick(): number {
    return this.resources.tick;
  }

  public get playerId(): string {
    return this.resources.playerId;
  }

  private readonly world = new World<SimulationEntity>();
  private readonly buildingsQuery = this.world.with('building');
  private readonly depositsQuery = this.world.with('deposit', 'transform');
  private readonly pilesQuery = this.world.with('pile', 'transform');
  private readonly bodiesQuery = this.world.with('physics', 'transform');
  private readonly opening: OpeningSystem;
  private readonly factory: FactorySystem;
  private readonly ids = new Map<string, SimulationEntity>();
  private readonly slots: (SimulationEntity | undefined)[] = [];
  private readonly generations: number[] = [];
  private readonly free: number[] = [];
  private dirty: (SimulationEntity | undefined)[] = [];
  private dirtyLength = 0;
  private dirtyCount = 0;
  private created: EntityMapping[] = [];
  private removed: number[] = [];
  private version = 0;
  private readonly playerMotor: PlayerMotor;
  private readonly content: ContentDefinition;
  private readonly context: OpeningContext;
  private readonly authoredDeposits: ReadonlyMap<string, DepositDefinition>;
  private readonly physics: WorldPhysics;
  private structural: { id?: string; data?: EntityData }[] = [];
  private disposed = false;
  private stepping = false;
  private readonly developerFixture: boolean;
  private endpoints: PlayerEndpoint[] = [];

  constructor(definition: WorldDefinition, options: SimulationOptions = {}) {
    this.content = ownContent(OPENING_CONTENT);
    if (options.snapshot) assertSnapshot(options.snapshot, this.content);
    assertWorldDefinition(definition);
    check(
      !options.snapshot ||
        JSON.stringify(options.snapshot.definition) === JSON.stringify(definition),
      'Restore definition mismatch',
    );
    this.definition = structuredClone(definition);
    this.authoredDeposits = new Map(
      this.definition.deposits.map((deposit) => [deposit.id, deposit]),
    );

    const freeze = (value: unknown): void => {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    };

    freeze(this.definition);
    this.developerFixture = options.developerFixture ?? false;
    let playerId = 'player';
    const authored = new Set(
      [...definition.deposits, ...definition.blockers, ...(definition.bodies ?? [])].map(
        (e) => e.id,
      ),
    );
    for (let n = 0; authored.has(playerId); n++) playerId = `player:${n}`;
    this.resources = options.snapshot
      ? structuredClone(options.snapshot.resources)
      : {
          worldId: definition.id,
          playerId,
          tick: 0,
          stepSeconds: FIXED_STEP_SECONDS,
          nextEntityId: 1,
          research: {},
          productionTotals: {},
          extractionTotals: {},
        };
    if (options.snapshot) {
      for (const record of options.snapshot.entities) this.insert(structuredClone(record));
    } else {
      this.insert({
        id: playerId,
        kind: 'player',
        transform: {
          position: { ...definition.spawn },
          facing: 0,
          moving: false,
          sprinting: false,
        },
        inventory: emptyInventory(),
        equipment: { tool: null },
        opening: newOpening(),
      });
      for (const deposit of definition.deposits)
        this.insert({
          id: deposit.id,
          kind: 'deposit',
          transform: {
            position: { ...deposit.position },
            facing: 0,
            moving: false,
            sprinting: false,
          },
          deposit: { kind: 'scrap', quantity: deposit.quantity },
        });
      for (const body of definition.bodies ?? []) {
        const angle = (body.rotation * Math.PI) / 2;
        this.insert({
          id: body.id,
          kind: 'body',
          physics: structuredClone(body),
          transform: {
            position: { ...body.position },
            facing: 0,
            moving: false,
            sprinting: false,
            rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) },
          },
        });
      }
    }
    this.resources.factory ??= { connections: [] };
    const player = this.ids.get(this.resources.playerId);
    check(player?.transform, 'Missing player transform');
    check(player.opening, 'Missing opening component');
    this.physics = new WorldPhysics(
      this.definition,
      player.id,
      player.transform.position,
      options.snapshot?.physics,
    );
    try {
      this.rebuildCollision();
      if (options.snapshot?.physics)
        this.physics.assertRestoredState(
          player.transform.position,
          Array.from(this.bodiesQuery, (e) => ({
            id: e.id,
            position: e.transform.position,
            rotation: e.transform.rotation!,
          })),
        );
      else this.physics.assertClearance();
    } catch (error) {
      this.physics.dispose();
      throw error;
    }
    this.playerMotor = new PlayerMotor(player.transform, this.physics);
    this.context = {
      player,
      piles: this.pilesQuery.entities,
      resources: this.resources,
      allocateId: (prefix) => this.allocateId(prefix),
      get: (id) => this.ids.get(id),
      mark: (entity, detailsOnly) => this.mark(entity, detailsOnly),
      add: (data) => {
        check(
          this.stepping && this.structural.length < 250000,
          'Mutation outside fixed step/overflow',
        );
        this.structural.push({ data });
      },
      remove: (id) => {
        check(
          this.stepping && this.structural.length < 250000,
          'Mutation outside fixed step/overflow',
        );
        this.structural.push({ id });
      },
    };
    this.opening = new OpeningSystem(this.context);
    this.factory = new FactorySystem({
      ...this.context,
      definition: this.definition,
      resources: this.resources,
      machines: this.buildingsQuery.entities,
      deposits: () => this.readDeposits(),
      add: (data) => {
        this.insert(data);
      },
      remove: (id) => this.remove(id),
    });
    this.rememberPlayer();
  }

  private mapping(e: SimulationEntity): EntityMapping {
    const authored = e.deposit && e.transform ? this.authoredDeposits.get(e.id) : undefined;
    return {
      id: e.id,
      slot: e.slot,
      generation: e.generation,
      kind: e.kind,
      ...(e.pile ? { pile: { item: e.pile.item } } : {}),
      ...(e.building ? { building: structuredClone(e.building) } : {}),
      ...(e.physics ? { physics: structuredClone(e.physics) } : {}),
      ...(authored
        ? {
            deposit: {
              kind: 'scrap' as const,
              footprint: { ...authored.footprint },
              rotation: authored.rotation,
              ...(authored.collision ? { collision: { ...authored.collision } } : {}),
            },
          }
        : {}),
    };
  }

  private insert(data: EntityData): SimulationEntity {
    check(!this.ids.has(data.id) && this.ids.size < 250000, 'Duplicate entity/population overflow');
    const slot = this.free.pop() ?? this.slots.length;
    const generation = this.generations[slot] ?? 0;
    // Keep hot fields adjacent and their offsets stable across kinds. Undefined
    // is Miniplex's absent-component value; cold metadata follows numeric work.
    const entity: SimulationEntity = {
      slot,
      generation,
      dirty: 0,
      id: data.id,
      kind: data.kind,
      transform: data.transform,
      inventory: data.inventory,
      equipment: data.equipment,
      deposit: data.deposit,
      pile: data.pile,
      building: data.building,
      opening: data.opening,
      physics: data.physics,
      machine: data.machine,
    };
    this.world.add(entity);
    this.ids.set(entity.id, entity);
    this.slots[slot] = entity;
    this.created.push(this.mapping(entity));
    this.mark(entity);
    return entity;
  }

  private remove(id: string): void {
    const entity = this.ids.get(id);
    check(entity && id !== this.resources.playerId, 'Invalid removal');
    this.world.remove(entity);
    this.ids.delete(id);
    if (entity.dirty & 2) this.dirtyCount--;
    this.removed.push(entity.slot, entity.generation);
    this.slots[entity.slot] = undefined;
    this.generations[entity.slot] = entity.generation + 1;
    this.free.push(entity.slot);
  }

  private mark(entity: SimulationEntity, detailsOnly = false): void {
    check(!this.disposed && this.slots[entity.slot] === entity, 'Stale/disposed entity');
    if (!entity.dirty) {
      this.dirty[this.dirtyLength++] = entity;
    }
    if (!detailsOnly && !(entity.dirty & 2)) this.dirtyCount++;
    entity.dirty |= detailsOnly ? 1 : 3;
  }

  private readDeposits(): DepositDefinition[] {
    return Array.from(this.depositsQuery).flatMap((e) => {
      const source = this.authoredDeposits.get(e.id);
      return source
        ? [
            {
              ...structuredClone(source),
              position: { ...e.transform.position },
              quantity: e.deposit.quantity,
            },
          ]
        : [];
    });
  }

  private rebuildCollision(): void {
    const buildings = Array.from(this.buildingsQuery, (e) => e.building);
    this.physics.syncStatic(staticColliders(this.definition, buildings, this.readDeposits()));
    this.physics.syncBodies(Array.from(this.bodiesQuery, (entity) => entity.physics));
  }

  private rememberPlayer(): void {
    this.endpoints.push({
      tick: this.resources.tick,
      transform: structuredClone(this.ids.get(this.resources.playerId)!.transform!),
    });
    if (this.endpoints.length > 2) this.endpoints.shift();
  }

  public clearInput(preserveWork = false): readonly OpeningEvent[] {
    check(!this.disposed, 'Disposed simulation');
    this.playerMotor.clearInput();
    if (!preserveWork) this.opening.interrupt();
    this.mark(this.ids.get(this.resources.playerId)!);
    return this.opening.drainEvents();
  }

  public step(
    movement: MovementIntent,
    commands: readonly WorldCommand[] = [],
  ): SimulationStepResult {
    check(!this.disposed && !this.stepping, 'Disposed or recursive simulation');
    check(commands.length <= 256, 'Command overflow');
    this.stepping = true;
    const commandResults: CommandResult[] = [];
    try {
      for (const command of commands) {
        if (isFactoryCommand(command)) {
          commandResults.push(this.factory.command(command));
          if (this.factory.collisionChanged) this.rebuildCollision();
          continue;
        }
        if (command.type !== 'place') {
          const result = this.opening.command(command);
          commandResults.push(result);
          continue;
        }
        if (command.type !== 'place' || command.buildingId !== 'test-building') {
          const result: CommandResult = { accepted: false, reason: 'unknown-command' };
          commandResults.push(result);
          continue;
        }
        const result = validatePlacement(
          this.definition,
          this.view,
          command.cell,
          command.rotation,
          this.developerFixture,
        );
        commandResults.push({ accepted: result.valid, reason: result.reason });
        if (result.valid) {
          const id = this.allocateId('building');
          const building: BuildingView = {
            id,
            buildingId: 'test-building',
            cell: { ...command.cell },
            position: cellCenter(this.definition.grid, command.cell),
            footprint: { ...TEST_BUILDING_FOOTPRINT },
            rotation: command.rotation,
          };
          this.insert({ id, kind: 'building', building });
          this.rebuildCollision();
        }
      }
      this.playerMotor.step(movement, this.resources.tick);
      for (const id of this.physics.changedBodies()) {
        const entity = this.ids.get(id);
        check(entity?.physics && entity.transform, 'Missing physical ECS entity');
        const pose = this.physics.pose(entity.id);
        const previous = entity.transform;
        const rotation = previous.rotation!;
        if (
          previous.position.x === pose.position.x &&
          previous.position.y === pose.position.y &&
          previous.position.z === pose.position.z &&
          rotation.x === pose.rotation.x &&
          rotation.y === pose.rotation.y &&
          rotation.z === pose.rotation.z &&
          rotation.w === pose.rotation.w &&
          previous.moving === !pose.sleeping
        )
          continue;
        previous.position = { ...pose.position };
        previous.rotation = { ...pose.rotation };
        previous.moving = !pose.sleeping;
        this.mark(entity);
      }
      this.opening.step(FIXED_STEP_SECONDS, () => this.factory.step(FIXED_STEP_SECONDS));
      if (this.opening.collisionChanged || this.factory.collisionChanged) this.rebuildCollision();
      this.mark(this.ids.get(this.resources.playerId)!);
      let physicalChange = false;
      for (const change of this.structural) {
        const record = change.data ?? (change.id ? this.ids.get(change.id) : undefined);
        physicalChange ||= !!(record?.physics || record?.building || record?.deposit);
        if (change.id) this.remove(change.id);
        if (change.data) this.insert(change.data);
      }
      if (physicalChange) this.rebuildCollision();
      this.structural = [];
      this.resources.tick++;
      this.rememberPlayer();
      return { commandResults, events: this.opening.drainEvents() };
    } finally {
      this.stepping = false;
    }
  }

  public inspect(ids: readonly string[]): Inspection[] {
    check(
      ids.length <= MAX_DETAIL_SUBSCRIPTIONS && new Set(ids).size === ids.length,
      'Inspection overflow/duplicate',
    );
    return ids.flatMap((id) => {
      const e = this.ids.get(id);
      return e ? [{ id, tick: this.resources.tick, entity: this.detach(e) }] : [];
    });
  }

  private detach(e: SimulationEntity): EntityData {
    const data: EntityData = { id: e.id, kind: e.kind };
    for (const key of [
      'transform',
      'inventory',
      'equipment',
      'deposit',
      'pile',
      'building',
      'opening',
      'physics',
      'machine',
    ] as const)
      if (e[key] !== undefined) Object.assign(data, { [key]: e[key] });
    return structuredClone(data);
  }

  public publish(watched: ReadonlySet<string>, full = false): PresentationPacket {
    check(
      !this.disposed && !this.stepping && watched.size <= MAX_DETAIL_SUBSCRIPTIONS,
      'Invalid publication boundary',
    );
    const entities = full ? this.world.entities : this.dirty;
    const length = full ? this.ids.size : this.dirtyLength;
    const count = full ? this.ids.size : this.dirtyCount;
    const rows = new Float64Array(count * PRESENTATION_STRIDE);
    const details: Inspection[] = [];
    const rotations: number[] = [];
    let at = 0;
    for (let index = 0; index < length; index++) {
      const e = entities[index]!;
      if (this.slots[e.slot] !== e) continue;
      const numeric = full || !!(e.dirty & 2);
      e.dirty = 0;
      if (watched.has(e.id))
        details.push({ id: e.id, tick: this.resources.tick, entity: this.detach(e) });
      if (!numeric) continue;
      rows[at] = e.slot;
      rows[at + 1] = e.generation;
      // Fresh numeric buffers already contain zero. Write only present components;
      // the fixed wire layout and precision are identical for every entity kind.
      const t = e.transform,
        p = t?.position ?? e.building?.position;
      if (p) {
        rows[at + 2] = p.x;
        rows[at + 3] = p.y;
        rows[at + 4] = p.z;
      }
      if (t) {
        rows[at + 5] = t.facing;
        rows[at + 6] = 1 | (t.moving ? 2 : 0) | (t.sprinting ? 4 : 0);
      }
      if (e.deposit) rows[at + 7] = e.deposit.quantity;
      else if (e.pile) rows[at + 7] = e.pile.quantity;
      if (e.physics && t?.rotation)
        rotations.push(
          e.slot,
          e.generation,
          t.rotation.x,
          t.rotation.y,
          t.rotation.z,
          t.rotation.w,
        );
      at += PRESENTATION_STRIDE;
    }
    // A batch can create, remove and recycle a slot before publication. Only
    // its surviving generation needs a creation mapping in the final delta.
    const mappings = full
      ? Array.from(this.world, (e) => this.mapping(e))
      : this.created.filter(
          (mapping) => this.slots[mapping.slot]?.generation === mapping.generation,
        );
    const packet: PresentationPacket = {
      schema: 2,
      version: ++this.version,
      base: this.version - 1,
      full,
      tick: this.resources.tick,
      nextEntityId: this.resources.nextEntityId,
      worldId: this.resources.worldId,
      playerId: this.resources.playerId,
      mappings,
      rows: rows.buffer,
      removed: new Float64Array(this.removed).buffer,
      details,
      endpoints: this.endpoints.map((e) => structuredClone(e)),
      research: Object.entries(this.resources.research)
        .filter(([, l]) => l.unlocked)
        .map(([id]) => id),
      productionTotals: { ...this.resources.productionTotals },
      opening: this.opening.view(),
      factory: this.factory.summary(),
      ...(rotations.length ? { rotations: new Float64Array(rotations).buffer } : {}),
    };
    // Retain bounded backing storage, release component references, and avoid
    // growing a new JS array for every publication.
    this.dirty.fill(undefined, 0, this.dirtyLength);
    this.dirtyLength = 0;
    this.dirtyCount = 0;
    this.created = [];
    this.removed = [];
    return packet;
  }

  public capture(): SimulationSnapshot {
    check(!this.disposed && !this.stepping, 'Invalid capture boundary');
    return {
      version: 3,
      contentVersion: this.content.version,
      definition: structuredClone(this.definition) as EditableData<WorldDefinition>,
      resources: structuredClone(this.resources),
      entities: Array.from(this.world, (e) => this.detach(e)).sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
      physics: this.physics.capture(),
    };
  }

  public get view(): WorldView {
    const player = this.ids.get(this.resources.playerId)!;
    const inventory: Record<string, number> = {};
    for (const slot of player.inventory!.slots)
      if (slot) inventory[slot.item] = (inventory[slot.item] ?? 0) + slot.quantity;
    return {
      worldId: this.resources.worldId,
      tick: this.resources.tick,
      stepSeconds: FIXED_STEP_SECONDS,
      nextEntityId: this.resources.nextEntityId,
      player: structuredClone(player.transform!),
      inventory,
      opening: this.opening.view(),
      factory: this.factory.summary(),
      ground: this.groundView(),
      equipment: player.equipment?.tool ? [player.equipment.tool] : [],
      research: Object.entries(this.resources.research)
        .filter(([, r]) => r.unlocked)
        .map(([id]) => id),
      productionTotals: { ...this.resources.productionTotals },
      deposits: this.readDeposits(),
      buildings: Array.from(this.buildingsQuery, (e) => structuredClone(e.building)),
      bodies: Array.from(this.bodiesQuery, (e) => ({
        id: e.id,
        position: { ...e.transform.position },
        rotation: { ...e.transform.rotation! },
        collision: { ...e.physics.collision },
        motion: e.physics.motion,
      })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buildingsQuery.disconnect();
    this.depositsQuery.disconnect();
    this.pilesQuery.disconnect();
    this.bodiesQuery.disconnect();
    this.physics.dispose();
    this.world.clear();
    this.ids.clear();
    this.slots.length = this.generations.length = this.free.length = 0;
    this.dirty = [];
    this.dirtyLength = 0;
    this.dirtyCount = 0;
    this.created = [];
    this.removed = [];
    this.structural = [];
    this.endpoints = [];
  }

  private groundView() {
    return Array.from(this.pilesQuery, (entity) => ({
      id: entity.id,
      position: { ...entity.transform.position },
      item: entity.pile.item,
      quantity: entity.pile.quantity,
    }));
  }

  private allocateId(prefix: string): string {
    let id: string;
    do {
      id = `${prefix}-${this.resources.nextEntityId++}`;
    } while (this.ids.has(id) || this.definition.blockers.some((entity) => entity.id === id));
    return id;
  }
}
