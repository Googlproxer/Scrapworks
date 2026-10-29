import type { BuildingView, DepositDefinition, WorldView } from '@contracts/world';
import type {
  EntityData,
  EntityMapping,
  Inspection,
  PresentationPacket,
} from '@contracts/simulation';
import {
  PRESENTATION_STRIDE as stride,
  MAX_DETAIL_SUBSCRIPTIONS,
  requireInvariant as check,
} from '@contracts/simulation';
export class PublicationGapError extends Error {}

/** Main-thread presentation storage. No ECS import, component aliases or per-frame population scan. */
export class PresentationCache {
  private rows = new Float64Array(0);
  private mappings: (EntityMapping | undefined)[] = [];
  private readonly ids = new Map<string, EntityMapping>();
  private readonly deposits = new Map<string, DepositDefinition>();
  private readonly buildings = new Map<string, BuildingView>();
  private depositViews: readonly DepositDefinition[] = [];
  private buildingViews: readonly BuildingView[] = [];
  private current?: WorldView;
  public readonly details = new Map<string, Inspection>();
  public version = 0;
  public playerId = '';
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
      packet.schema === 1 &&
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
    let renderablesChanged = packet.full;
    for (let at = 0; at < removed.length; at += 2) {
      const mapping = this.mappings[removed[at]];
      if (mapping?.generation !== removed[at + 1]) continue;
      this.ids.delete(mapping.id);
      this.mappings[mapping.slot] = undefined;
      this.details.delete(mapping.id);
      if (this.deposits.delete(mapping.id) || this.buildings.delete(mapping.id)) {
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
      if (mapping.deposit || mapping.building) {
        const position = { x: rows[at + 2], y: rows[at + 3], z: rows[at + 4] };
        if (mapping.deposit)
          this.deposits.set(mapping.id, {
            id: mapping.id,
            position,
            footprint: mapping.deposit.footprint,
            rotation: mapping.deposit.rotation,
            kind: 'scrap',
            quantity: rows[at + 7],
          });
        if (mapping.building) this.buildings.set(mapping.id, { ...mapping.building, position });
        if (mapping.deposit) changedDeposits.push(this.deposits.get(mapping.id)!);
        if (mapping.building) changedBuildings.push(this.buildings.get(mapping.id)!);
        upsertedIds.push(mapping.id);
        renderablesChanged = true;
      }
    }
    for (const detail of packet.details) this.details.set(detail.id, detail);
    this.playerId = packet.playerId;
    const player = this.ids.get(packet.playerId);
    check(player, 'Missing player presentation');
    const offset = player.slot * stride;
    const flags = this.rows[offset + 6];
    if (renderablesChanged) {
      this.depositViews = Array.from(this.deposits.values());
      this.buildingViews = Array.from(this.buildings.values());
    }
    const inventory: Record<string, number> = {};
    const playerDetails = this.details.get(packet.playerId)?.entity;
    for (const slot of playerDetails?.inventory?.slots ?? [])
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
      equipment: playerDetails?.equipment?.tool ? [playerDetails.equipment.tool] : [],
      research: packet.research,
      productionTotals: packet.productionTotals,
      deposits: this.depositViews,
      buildings: this.buildingViews,
      lastCommandResult: packet.lastCommandResult,
      changes: {
        full: packet.full,
        upsertedIds,
        removedIds,
        deposits: changedDeposits,
        buildings: changedBuildings,
      },
    };
    this.version = packet.version;
    return true;
  }
  public replaceDetails(ids: readonly string[], details: readonly Inspection[]): void {
    check(ids.length <= MAX_DETAIL_SUBSCRIPTIONS, 'Inspection overflow');
    this.details.clear();
    for (const detail of details)
      if (ids.includes(detail.id) && this.ids.has(detail.id)) this.details.set(detail.id, detail);
  }
  /** Independent field decoder assertion, used outside measured regions. */
  public verify(entities: readonly EntityData[]): void {
    check(
      entities.length === this.ids.size && entities.every((e) => this.ids.has(e.id)),
      'Presentation population mismatch',
    );
    for (const entity of entities) {
      const m = this.ids.get(entity.id)!;
      const offset = m.slot * stride,
        t = entity.transform,
        p = t?.position ?? entity.building?.position;
      const expected = [
        p?.x ?? 0,
        p?.y ?? 0,
        p?.z ?? 0,
        t?.facing ?? 0,
        (t ? 1 : 0) | (t?.moving ? 2 : 0) | (t?.sprinting ? 4 : 0),
        entity.deposit?.quantity ?? entity.pile?.quantity ?? 0,
        entity.work?.remaining ?? 0,
        entity.charge?.value ?? 0,
        entity.work?.reserved.reduce((n, s) => n + s.quantity, 0) ?? 0,
        entity.work?.held.reduce((n, s) => n + s.quantity, 0) ?? 0,
        entity.work?.status === 'active' ? 1 : entity.work?.status === 'blocked' ? 2 : 0,
        entity.work?.completed ?? 0,
      ];
      check(
        expected.every((value, field) => value === this.rows[offset + field + 2]),
        `Presentation field mismatch: ${entity.id}`,
      );
      const detail = this.details.get(entity.id);
      if (detail)
        check(
          JSON.stringify(detail.entity) === JSON.stringify(entity),
          `Inspection mismatch: ${entity.id}`,
        );
    }
  }
  public dispose(): void {
    this.rows = new Float64Array(0);
    this.mappings = [];
    this.ids.clear();
    this.deposits.clear();
    this.buildings.clear();
    this.details.clear();
    this.current = undefined;
    this.depositViews = [];
    this.buildingViews = [];
  }
}
