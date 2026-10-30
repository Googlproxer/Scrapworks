import { World } from 'miniplex';
import type {
  BuildingView,
  CommandResult,
  GridCell,
  WorldCommand,
  WorldDefinition,
  WorldView,
} from '@contracts/world';
import { assertWorldDefinition } from '@contracts/world';
import type {
  ContentDefinition,
  EntityData,
  EntityMapping,
  Inspection,
  PlayerEndpoint,
  PresentationPacket,
  SimulationSnapshot,
  WorldResources,
  ItemStack,
} from '@contracts/simulation';
import {
  MAX_DETAIL_SUBSCRIPTIONS,
  PRESENTATION_STRIDE,
  requireInvariant as check,
} from '@contracts/simulation';
import { cellCenter } from '@core/world-grid';
import { TEST_BUILDING_FOOTPRINT, validatePlacement } from './placement';
import { PlayerMotor, type MovementIntent } from './player-motor';
import { FIXED_STEP_SECONDS, occupiedCells } from './world-rules';
import { assertSnapshot, EMPTY_CONTENT, ownContent } from './capture';
import { emptyInventory } from './domain/inventory';
export type { MovementIntent } from './player-motor';
export { FIXED_STEP_SECONDS, PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED } from './world-rules';
const stackCount = (stacks: readonly ItemStack[] | undefined): number => {
  let count = 0;
  if (stacks) for (const stack of stacks) count += stack.quantity;
  return count;
};

/** Internal simulation records. Only detached plain data crosses the session boundary. */
export interface SimulationEntity extends EntityData {
  slot: number;
  generation: number;
  active?: true;
  /** 1 = detached details changed, 2 = numeric row changed. */
  dirty: number;
}
export interface SystemContext {
  readonly active: Iterable<SimulationEntity>;
  readonly entities: Iterable<SimulationEntity>;
  readonly resources: WorldResources;
  get(id: string): SimulationEntity | undefined;
  mark(entity: SimulationEntity, detailsOnly?: boolean): void;
  replace(id: string, data: EntityData): void;
  add(data: EntityData): void;
  remove(id: string): void;
  membership(entity: SimulationEntity, active: boolean): void;
}
export type SimulationSystem = (context: SystemContext) => void;
export interface SimulationOptions {
  developerFixture?: boolean;
  content?: ContentDefinition;
  snapshot?: SimulationSnapshot;
  /** Trusted plain system composition; never accepted in a worker message. */
  system?: SimulationSystem;
}

/** One private ECS authority, pure fixed steps, no renderer, storage or clock APIs. */
export class Simulation {
  public readonly definition: WorldDefinition;
  public readonly resources: WorldResources;
  private readonly world = new World<SimulationEntity>();
  private readonly active = this.world.with('work', 'active');
  private readonly buildingsQuery = this.world.with('building');
  private readonly depositsQuery = this.world.with('deposit', 'transform');
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
  private commands: WorldCommand[] = [];
  private lastCommandResult: CommandResult | null = null;
  public commandResults: CommandResult[] = [];
  private readonly playerMotor: PlayerMotor;
  private readonly content: ContentDefinition;
  private readonly system?: SimulationSystem;
  private readonly context: SystemContext;
  private collisionCells: readonly GridCell[] = [];
  private structural: { id?: string; data?: EntityData }[] = [];
  private disposed = false;
  private stepping = false;
  private readonly developerFixture: boolean;
  private endpoints: PlayerEndpoint[] = [];

  constructor(definition: WorldDefinition, options: SimulationOptions = {}) {
    this.content = options.content ? ownContent(options.content) : EMPTY_CONTENT;
    if (options.snapshot) assertSnapshot(options.snapshot, this.content);
    assertWorldDefinition(definition);
    check(
      !options.snapshot ||
        JSON.stringify(options.snapshot.definition) === JSON.stringify(definition),
      'Restore definition mismatch',
    );
    this.definition = structuredClone(definition);
    const freeze = (value: unknown): void => {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    };
    freeze(this.definition);
    this.developerFixture = options.developerFixture ?? false;
    let playerId = 'player';
    const authored = new Set([...definition.deposits, ...definition.blockers].map((e) => e.id));
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
          counters: {},
        };
    if (options.snapshot) {
      for (const record of options.snapshot.entities) this.insert(structuredClone(record));
      this.lastCommandResult = structuredClone(options.snapshot.lastCommandResult);
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
    }
    const player = this.ids.get(this.resources.playerId);
    check(player?.transform, 'Missing player transform');
    this.rebuildCollision();
    this.playerMotor = new PlayerMotor(
      this.definition,
      player.transform,
      () => this.collisionCells,
    );
    this.system = options.system;
    this.context = {
      active: this.active.entities,
      entities: this.world.entities,
      resources: this.resources,
      get: (id) => this.ids.get(id),
      mark: (entity, detailsOnly) => this.mark(entity, detailsOnly),
      replace: (id, data) => {
        check(
          this.stepping && this.structural.length < 250000,
          'Mutation outside fixed step/overflow',
        );
        this.structural.push({ id, data });
      },
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
      membership: (entity, enabled) => {
        check(this.stepping && this.ids.get(entity.id) === entity, 'Stale membership');
        // Undefined is Miniplex's absent-component sentinel. Native update/reindex
        // preserves query semantics without deleting a hot object's property.
        this.world.update(entity, 'active', enabled ? true : undefined);
        this.mark(entity);
      },
    };
    this.rememberPlayer();
  }
  private mapping(e: SimulationEntity): EntityMapping {
    const authored =
      e.deposit && e.transform ? this.definition.deposits.find((d) => d.id === e.id) : undefined;
    return {
      id: e.id,
      slot: e.slot,
      generation: e.generation,
      kind: e.kind,
      ...(e.building ? { building: structuredClone(e.building) } : {}),
      ...(authored
        ? {
            deposit: {
              kind: 'scrap' as const,
              footprint: { ...authored.footprint },
              rotation: authored.rotation,
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
      work: data.work,
      charge: data.charge,
      id: data.id,
      kind: data.kind,
      transform: data.transform,
      inventory: data.inventory,
      equipment: data.equipment,
      deposit: data.deposit,
      pile: data.pile,
      building: data.building,
      owner: data.owner,
      active: data.work?.status === 'active' ? true : undefined,
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
  private rebuildCollision(): void {
    const buildings = Array.from(this.buildingsQuery, (e) => e.building);
    const cells = occupiedCells(this.definition, buildings);
    for (let row = 0; row < this.definition.grid.rows; row++)
      for (let column = 0; column < this.definition.grid.columns; column++)
        if (this.definition.terrain[row * this.definition.grid.columns + column] === 'water')
          cells.push({ row, column });
    this.collisionCells = cells;
  }
  private rememberPlayer(): void {
    this.endpoints.push({
      tick: this.resources.tick,
      transform: structuredClone(this.ids.get(this.resources.playerId)!.transform!),
    });
    if (this.endpoints.length > 2) this.endpoints.shift();
  }
  public enqueue(command: WorldCommand): void {
    check(!this.disposed && this.commands.length < 256, 'Disposed simulation/command overflow');
    this.commands.push(structuredClone(command));
  }
  public clearInput(): void {
    this.commands = [];
    this.playerMotor.clearInput();
    this.mark(this.ids.get(this.resources.playerId)!);
  }
  public step(movement: MovementIntent): void {
    check(!this.disposed && !this.stepping, 'Disposed or recursive simulation');
    this.stepping = true;
    try {
      this.commandResults = [];
      for (const command of this.commands) {
        if (command.type !== 'place' || command.buildingId !== 'test-building') {
          this.lastCommandResult = { accepted: false, reason: 'unknown-command' };
          this.commandResults.push(this.lastCommandResult);
          continue;
        }
        const result = validatePlacement(
          this.definition,
          this.view,
          command.cell,
          command.rotation,
          this.developerFixture,
        );
        this.lastCommandResult = { accepted: result.valid, reason: result.reason };
        this.commandResults.push(this.lastCommandResult);
        if (result.valid) {
          let id: string;
          do {
            id = `building-${this.resources.nextEntityId++}`;
          } while (this.ids.has(id) || this.definition.blockers.some((e) => e.id === id));
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
      this.commands = [];
      this.system?.(this.context);
      this.playerMotor.step(movement);
      this.mark(this.ids.get(this.resources.playerId)!);
      for (const change of this.structural) {
        if (change.id) this.remove(change.id);
        if (change.data) this.insert(change.data);
      }
      if (this.structural.length) this.rebuildCollision();
      this.structural = [];
      this.resources.tick++;
      this.rememberPlayer();
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
      'owner',
      'work',
      'charge',
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
      if (e.charge) rows[at + 9] = e.charge.value;
      const work = e.work;
      if (work) {
        rows[at + 8] = work.remaining;
        rows[at + 10] = stackCount(work.reserved);
        rows[at + 11] = stackCount(work.held);
        rows[at + 12] = work.status === 'active' ? 1 : work.status === 'blocked' ? 2 : 0;
        rows[at + 13] = work.completed;
      }
      at += PRESENTATION_STRIDE;
    }
    const packet: PresentationPacket = {
      schema: 1,
      version: ++this.version,
      base: this.version - 1,
      full,
      tick: this.resources.tick,
      nextEntityId: this.resources.nextEntityId,
      worldId: this.resources.worldId,
      playerId: this.resources.playerId,
      mappings: full ? Array.from(this.world, (e) => this.mapping(e)) : this.created,
      rows: rows.buffer,
      removed: new Float64Array(this.removed).buffer,
      details,
      endpoints: this.endpoints.map((e) => structuredClone(e)),
      lastCommandResult: this.lastCommandResult ? { ...this.lastCommandResult } : null,
      research: Object.entries(this.resources.research)
        .filter(([, l]) => l.unlocked)
        .map(([id]) => id),
      productionTotals: { ...this.resources.productionTotals },
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
  public setPublicationDirty(fraction: number): void {
    for (let index = 0; index < this.dirtyLength; index++) this.dirty[index]!.dirty = 0;
    this.dirty.fill(undefined, 0, this.dirtyLength);
    this.dirtyLength = 0;
    this.dirtyCount = 0;
    let remaining = Math.floor(this.ids.size * fraction);
    for (const entity of this.world) {
      if (remaining-- <= 0) break;
      this.mark(entity);
    }
  }
  public capture(): SimulationSnapshot {
    check(!this.disposed && !this.stepping, 'Invalid capture boundary');
    return {
      version: 1,
      contentVersion: this.content.version,
      definition: structuredClone(this.definition),
      resources: structuredClone(this.resources),
      entities: Array.from(this.world, (e) => this.detach(e)).sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
      lastCommandResult: structuredClone(this.lastCommandResult),
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
      equipment: player.equipment?.tool ? [player.equipment.tool] : [],
      research: Object.entries(this.resources.research)
        .filter(([, r]) => r.unlocked)
        .map(([id]) => id),
      productionTotals: { ...this.resources.productionTotals },
      deposits: Array.from(this.depositsQuery).flatMap((e) => {
        const source = this.definition.deposits.find((d) => d.id === e.id);
        return source ? [{ ...structuredClone(source), quantity: e.deposit.quantity }] : [];
      }),
      buildings: Array.from(this.buildingsQuery, (e) => structuredClone(e.building)),
      lastCommandResult: structuredClone(this.lastCommandResult),
    };
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active.disconnect();
    this.buildingsQuery.disconnect();
    this.depositsQuery.disconnect();
    this.world.clear();
    this.ids.clear();
    this.slots.length = this.generations.length = this.free.length = 0;
    this.dirty = [];
    this.dirtyLength = 0;
    this.dirtyCount = 0;
    this.created = [];
    this.removed = [];
    this.commands = [];
    this.structural = [];
    this.endpoints = [];
    this.collisionCells = [];
  }
}
