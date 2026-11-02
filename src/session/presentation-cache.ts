import { freezePresentation } from './freeze-presentation';
import type { BuildingView, DepositDefinition, WorldView } from '@contracts/world';
import type { GroundItemView } from '@contracts/opening';
import type { PhysicsBodyView } from '@contracts/physics';
import type { EntityMapping, Inspection, PresentationPacket } from '@contracts/simulation';
import {
  PRESENTATION_STRIDE as stride,
  MAX_DETAIL_SUBSCRIPTIONS,
  ROTATION_STRIDE,
  requireInvariant as check,
} from '@contracts/simulation';

export class PublicationGapError extends Error {}

/** Main-thread presentation storage. No ECS import, component aliases or per-frame population scan. */
export class PresentationCache {
  private readonly freezeViews: boolean;

  public constructor(freezeViews = false) {
    this.freezeViews = freezeViews;
  }

  private rows = new Float64Array(0);
  private mappings: (EntityMapping | undefined)[] = [];
  private readonly ids = new Map<string, EntityMapping>();
  private readonly deposits = new Map<string, DepositDefinition>();
  private readonly buildings = new Map<string, BuildingView>();
  private readonly ground = new Map<string, GroundItemView>();
  private readonly bodies = new Map<string, PhysicsBodyView>();
  private bodyViews: readonly PhysicsBodyView[] = [];
  private groundViews: readonly GroundItemView[] = [];
  private depositViews: readonly DepositDefinition[] = [];
  private buildingViews: readonly BuildingView[] = [];
  private current?: WorldView;
  private readonly details = new Map<string, Inspection>();
  private versionValue = 0;

  public get version(): number {
    return this.versionValue;
  }

  private playerIdValue = '';

  public get playerId(): string {
    return this.playerIdValue;
  }

  public detail(id: string): Inspection | undefined {
    return this.details.get(id);
  }

  public get size(): number {
    return this.ids.size;
  }

  public read(): WorldView {
    check(this.current, 'Simulation is not ready');
    return this.current;
  }

  public apply(packet: PresentationPacket, generation: number): boolean {
    if (packet.version <= this.version) return false;
    if (!(
      packet.schema === 2 &&
      Number.isSafeInteger(packet.version) &&
      Number.isSafeInteger(packet.base) &&
      packet.version === packet.base + 1 &&
      (packet.full || packet.base === this.version)
    ))
      throw new PublicationGapError(
        'Publication gap or invalid schema: resynchronization required',
      );
    check(
      Number.isSafeInteger(packet.tick) &&
        packet.tick >= 0 &&
        packet.rows.byteLength % (stride * 8) === 0 &&
        packet.rows.byteLength <= 250000 * stride * 8 &&
        packet.removed.byteLength % 16 === 0 &&
        packet.details.length <= MAX_DETAIL_SUBSCRIPTIONS,
      'Invalid publication dimensions',
    );
    const rows = new Float64Array(packet.rows);
    const removed = new Float64Array(packet.removed);
    const rotations = packet.rotations ? new Float64Array(packet.rotations) : new Float64Array(0);
    check(
      rotations.length % ROTATION_STRIDE === 0 && rotations.length <= 10000 * ROTATION_STRIDE,
      'Invalid physics publication dimensions',
    );
    const orientation = new Map<number, { x: number; y: number; z: number; w: number }>();
    let maximum = 0;
    for (const m of packet.mappings) {
      check(
        Number.isInteger(m.slot) &&
          m.slot >= 0 &&
          m.slot < 250000 &&
          Number.isSafeInteger(m.generation) &&
          m.generation >= 0 &&
          typeof m.id === 'string' &&
          m.id.length > 0,
        'Invalid entity mapping',
      );
      maximum = Math.max(maximum, m.slot + 1);
    }
    for (let at = 0; at < rows.length; at += stride) {
      check(
        Number.isInteger(rows[at]) &&
          rows[at] >= 0 &&
          rows[at] < 250000 &&
          Number.isSafeInteger(rows[at + 1]) &&
          rows[at + 1] >= 0,
        'Invalid row identity',
      );
      for (let field = 2; field < stride; field++)
        check(Number.isFinite(rows[at + field]), 'Nonfinite presentation field');
      maximum = Math.max(maximum, rows[at] + 1);
    }
    for (let at = 0; at < removed.length; at += 2)
      check(
        Number.isInteger(removed[at]) &&
          removed[at] >= 0 &&
          removed[at] < 250000 &&
          Number.isSafeInteger(removed[at + 1]) &&
          removed[at + 1] >= 0,
        'Invalid removal',
      );
    // Validate identities against the resulting mapping before changing any retained cache.
    const staged = new Map<number, EntityMapping | undefined>();
    for (let at = 0; at < removed.length; at += 2) {
      const old = packet.full ? undefined : this.mappings[removed[at]];
      if (old?.generation === removed[at + 1]) staged.set(old.slot, undefined);
    }

    const lookup = (slot: number): EntityMapping | undefined =>
      staged.has(slot) ? staged.get(slot) : packet.full ? undefined : this.mappings[slot];

    for (const m of packet.mappings) {
      const existing = lookup(m.slot);
      check(
        !existing || (existing.id === m.id && existing.generation === m.generation),
        'Mapping reused without removal',
      );
      staged.set(m.slot, m);
    }
    for (let at = 0; at < rows.length; at += stride)
      check(lookup(rows[at])?.generation === rows[at + 1], 'Missing/stale row mapping');
    for (let at = 0; at < rotations.length; at += ROTATION_STRIDE) {
      const slot = rotations[at];
      check(
        Number.isInteger(slot) &&
          slot >= 0 &&
          lookup(slot)?.generation === rotations[at + 1] &&
          lookup(slot)?.physics &&
          !orientation.has(slot),
        'Missing/stale physics mapping',
      );
      const values = [rotations[at + 2], rotations[at + 3], rotations[at + 4], rotations[at + 5]];
      check(
        values.every(Number.isFinite) && Math.abs(Math.hypot(...values) - 1) < 0.001,
        'Invalid published rotation',
      );
      orientation.set(slot, { x: values[0], y: values[1], z: values[2], w: values[3] });
    }
    for (let at = 0; at < rows.length; at += stride)
      if (lookup(rows[at])?.physics)
        check(orientation.has(rows[at]), 'Missing physics orientation');
    const playerMapping =
      packet.mappings.find((m) => m.id === packet.playerId) ??
      (packet.full ? undefined : this.ids.get(packet.playerId));
    check(
      playerMapping && lookup(playerMapping.slot)?.id === packet.playerId,
      'Missing player presentation',
    );
    if (packet.full) {
      this.ids.clear();
      this.mappings = [];
      this.deposits.clear();
      this.buildings.clear();
      this.ground.clear();
      this.bodies.clear();
      this.details.clear();
    }
    if (maximum * stride > this.rows.length) {
      const next = new Float64Array(
        Math.min(250000, Math.max(maximum, (this.rows.length / stride) * 2, 16)) * stride,
      );
      if (!packet.full) next.set(this.rows);
      this.rows = next;
    }
    const upsertedIds: string[] = [];
    const removedIds: string[] = [];
    const changedDeposits: DepositDefinition[] = [];
    const changedBuildings: BuildingView[] = [];
    const changedBodies: PhysicsBodyView[] = [];
    let renderablesChanged = packet.full;
    for (let at = 0; at < removed.length; at += 2) {
      const mapping = this.mappings[removed[at]];
      if (mapping?.generation !== removed[at + 1]) continue;
      this.ids.delete(mapping.id);
      this.mappings[mapping.slot] = undefined;
      this.details.delete(mapping.id);
      if (
        this.deposits.delete(mapping.id) ||
        this.buildings.delete(mapping.id) ||
        this.ground.delete(mapping.id) ||
        this.bodies.delete(mapping.id)
      ) {
        removedIds.push(mapping.id);
        renderablesChanged = true;
      }
    }
    for (const mapping of packet.mappings) {
      const existing = this.mappings[mapping.slot];
      check(
        !existing || (existing.id === mapping.id && existing.generation === mapping.generation),
        'Mapping reused without removal',
      );
      this.mappings[mapping.slot] = mapping;
      this.ids.set(mapping.id, mapping);
    }
    for (let at = 0; at < rows.length; at += stride) {
      const mapping = this.mappings[rows[at]];
      check(mapping && mapping.generation === rows[at + 1], 'Missing/stale row mapping');
      const offset = mapping.slot * stride;
      for (let field = 0; field < stride; field++) this.rows[offset + field] = rows[at + field];
      if (mapping.deposit || mapping.building || mapping.pile || mapping.physics) {
        const position = { x: rows[at + 2], y: rows[at + 3], z: rows[at + 4] };
        if (mapping.deposit)
          this.deposits.set(mapping.id, {
            id: mapping.id,
            position,
            footprint: mapping.deposit.footprint,
            rotation: mapping.deposit.rotation,
            ...(mapping.deposit.collision ? { collision: mapping.deposit.collision } : {}),
            kind: 'scrap',
            quantity: rows[at + 7],
          });
        if (mapping.building) this.buildings.set(mapping.id, { ...mapping.building, position });
        if (mapping.physics) {
          const body: PhysicsBodyView = {
            id: mapping.id,
            position,
            rotation: orientation.get(mapping.slot)!,
            collision: mapping.physics.collision,
            motion: mapping.physics.motion,
          };
          this.bodies.set(mapping.id, body);
          changedBodies.push(body);
        }
        if (mapping.pile)
          this.ground.set(mapping.id, {
            id: mapping.id,
            position,
            item: mapping.pile.item,
            quantity: rows[at + 7],
          });
        if (mapping.deposit) changedDeposits.push(this.deposits.get(mapping.id)!);
        if (mapping.building) changedBuildings.push(this.buildings.get(mapping.id)!);
        upsertedIds.push(mapping.id);
        renderablesChanged = true;
      }
    }
    for (const detail of packet.details) this.details.set(detail.id, detail);
    this.playerIdValue = packet.playerId;
    const player = this.ids.get(packet.playerId);
    check(player, 'Missing player presentation');
    const offset = player.slot * stride;
    const flags = this.rows[offset + 6];
    if (renderablesChanged) {
      this.depositViews = Array.from(this.deposits.values());
      this.buildingViews = Array.from(this.buildings.values());
      this.groundViews = Array.from(this.ground.values());
      this.bodyViews = Array.from(this.bodies.values());
    }
    const inventory: Record<string, number> = {};
    const opening = packet.opening;
    for (const slot of opening?.bag.slots ?? [])
      if (slot) inventory[slot.item] = (inventory[slot.item] ?? 0) + slot.quantity;
    this.current = {
      worldId: packet.worldId,
      worldGeneration: generation,
      publication: packet.version,
      tick: packet.tick,
      stepSeconds: 0.05,
      nextEntityId: packet.nextEntityId,
      player: {
        position: { x: this.rows[offset + 2], y: this.rows[offset + 3], z: this.rows[offset + 4] },
        facing: this.rows[offset + 5],
        moving: !!(flags & 2),
        sprinting: !!(flags & 4),
      },
      endpoints: packet.endpoints,
      inventory,
      ...(packet.opening ? { opening: structuredClone(packet.opening) } : {}),
      equipment: opening?.tool ? [opening.tool] : [],
      research: packet.research,
      productionTotals: packet.productionTotals,
      deposits: this.depositViews,
      buildings: this.buildingViews,
      ground: this.groundViews,
      bodies: this.bodyViews,
      changes: {
        full: packet.full,
        upsertedIds,
        removedIds,
        deposits: changedDeposits,
        buildings: changedBuildings,
        bodies: changedBodies,
      },
    };
    if (this.freezeViews) freezePresentation(this.current);
    this.versionValue = packet.version;
    return true;
  }

  public replaceDetails(ids: readonly string[], details: readonly Inspection[]): void {
    check(ids.length <= MAX_DETAIL_SUBSCRIPTIONS, 'Inspection overflow');
    this.details.clear();
    for (const detail of details)
      if (ids.includes(detail.id) && this.ids.has(detail.id)) this.details.set(detail.id, detail);
  }

  public dispose(): void {
    this.rows = new Float64Array(0);
    this.mappings = [];
    this.ids.clear();
    this.deposits.clear();
    this.buildings.clear();
    this.ground.clear();
    this.details.clear();
    this.bodies.clear();
    this.current = undefined;
    this.depositViews = [];
    this.buildingViews = [];
    this.groundViews = [];
    this.bodyViews = [];
  }
}
