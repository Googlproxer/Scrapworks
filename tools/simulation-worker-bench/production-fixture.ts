import type {
  ContentDefinition,
  EntityData,
  SimulationCapture,
  SimulationSnapshot,
  WorkData,
} from '../../src/contracts/simulation';
import type { WorldDefinition } from '../../src/contracts/world';
import type {
  SimulationSystem,
  SystemContext,
  SimulationEntity,
} from '../../src/simulation/ecs-runtime';
import {
  emptyInventory,
  reserve,
  commitReservationAndRenew,
  transfer,
  spendByPriority,
} from '../../src/simulation/domain/inventory';
import { advanceWork } from '../../src/simulation/domain/work';

export type Workload = 'normal' | 'idle' | 'active' | 'churn';
export const content: ContentDefinition = Object.freeze({
  version: 'production-foundation-fixture-v1',
  items: Object.freeze({
    ore: Object.freeze({ stackLimit: 1000, solidValue: 1 }),
    plate: Object.freeze({ stackLimit: 1000, solidValue: 1 }),
  }),
  recipes: Object.freeze({
    press: Object.freeze({
      inputs: Object.freeze([{ item: 'ore', quantity: 1 }]),
      outputs: Object.freeze([{ item: 'plate', quantity: 1 }]),
      seconds: 1,
    }),
  }),
  technologies: Object.freeze(['fixture-research']),
});
export const definition: WorldDefinition = {
  version: 1,
  id: 'production-foundation-fixture',
  grid: { origin: { x: -100, z: -100 }, columns: 100, rows: 100, metresPerCell: 2 },
  terrain: Array<string>(10000).fill('soil'),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [],
  blockers: [],
};
const idFor = (n: number, revision = 0): string => `e${n}r${revision}`;
export function entity(n: number, size: number, workload: Workload, revision = 0): EntityData {
  const processors = Math.floor(size * 0.6),
    owners = Math.floor(size * 0.2);
  const id = n === processors ? 'player' : idFor(n, revision);
  if (n < processors) {
    const percentile = n % 100;
    const active = workload === 'active' || percentile < (workload === 'idle' ? 1 : 20);
    const blocked = !active && percentile >= (workload === 'idle' ? 90 : 80);
    const input = emptyInventory(4);
    input.slots[0] = { item: 'ore', quantity: 200 };
    reserve(input, { id: 'r', owner: id, items: [{ item: 'ore', quantity: 1 }] });
    return {
      id,
      kind: 'processor',
      owner: n % owners === 0 ? 'player' : idFor(processors + (n % owners)),
      work: {
        recipe: 'press',
        status: active ? 'active' : blocked ? 'blocked' : 'idle',
        remaining: (20 + ((n + 1729) % 7)) * 0.05,
        duration: (20 + (n % 7)) * 0.05,
        completed: 0,
        input,
        output: emptyInventory(4),
        reserved: [{ item: 'ore', quantity: 1 }],
        held: [],
      },
      charge: { value: n % 100, capacity: 100 },
    };
  }
  if (n < processors + owners) {
    const inventory = emptyInventory();
    for (let slot = 0; slot < 24; slot++)
      inventory.slots[slot] = { item: slot % 2 ? 'plate' : 'ore', quantity: 50 + slot };
    return {
      id,
      kind: id === 'player' ? 'player' : 'owner',
      inventory,
      ...(id === 'player'
        ? {
            transform: {
              position: { ...definition.spawn },
              facing: 0.123456789,
              moving: false,
              sprinting: false,
            },
            equipment: { tool: null },
          }
        : {}),
    };
  }
  if (n < size * 0.9)
    return { id, kind: 'deposit', deposit: { kind: 'scrap', quantity: 10000 + (n % 37) } };
  return { id, kind: 'pile', pile: { item: 'ore', quantity: 100 + (n % 13) } };
}
export function fixture(size: number, workload: Workload = 'normal'): SimulationCapture {
  const world: SimulationSnapshot = {
    version: 1,
    contentVersion: content.version,
    definition,
    resources: {
      worldId: definition.id,
      playerId: 'player',
      tick: 0,
      stepSeconds: 0.05,
      nextEntityId: size + 1,
      research: { 'fixture-research': { consumed: { ore: 0 }, work: 0, unlocked: false } },
      productionTotals: { plate: 0 },
      extractionTotals: { ore: 0 },
      counters: { completed: 0, transfers: 0, replacements: 0, injected: 0, shipped: 0 },
    },
    entities: Array.from({ length: size }, (_, n) => entity(n, size, workload)),
    lastCommandResult: null,
  };
  return { world, ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 }, pending: [] };
}
/** Synthetic replenishment and activity only; production imports none of this fixture. */
export function system(workload: Workload): SimulationSystem {
  const states = new WeakMap<
    SystemContext,
    { byOrdinal: SimulationEntity[]; pending: [number, string][] }
  >();
  return (ctx) => {
    let state = states.get(ctx);
    if (!state) {
      const byOrdinal: SimulationEntity[] = [];
      const all = Array.from(ctx.entities),
        playerOrdinal = Math.floor(all.length * 0.6);
      for (const e of all)
        byOrdinal[e.id === 'player' ? playerOrdinal : Number(e.id.slice(1).split('r')[0])] = e;
      state = { byOrdinal, pending: [] };
      states.set(ctx, state);
    }
    for (const [n, id] of state.pending) state.byOrdinal[n] = ctx.get(id)!;
    state.pending = [];
    const records = state.byOrdinal,
      size = records.length,
      processors = Math.floor(size * 0.6),
      owners = Math.floor(size * 0.2);
    const tick = ctx.resources.tick,
      counters = ctx.resources.counters;
    const commit = (work: WorkData): boolean => {
      if (!commitReservationAndRenew(work.input, 'r', content))
        throw new Error('Missing work reservation');
      // Synthetic injection replaces exactly the consumed unit in its existing
      // input stack. It is not an additional gameplay inventory transaction.
      work.input.slots[0]!.quantity++;
      if (work.held.length) {
        const output = work.output.slots[0];
        if (output) output.quantity++;
        else work.output.slots[0] = { item: 'plate', quantity: 1 };
        if (work.output.slots[0]!.quantity === 500) {
          counters['shipped'] += 500;
          work.output.slots[0] = null;
        }
      } else work.held.push({ item: 'plate', quantity: 1 });
      counters['injected']++;
      counters['completed']++;
      ctx.resources.productionTotals['plate']++;
      return true;
    };
    for (const e of ctx.active) {
      const work = e.work!;
      advanceWork(work, 0.05, commit);
      e.charge!.value = (e.charge!.value + 0.25) % 100;
      ctx.mark(e);
    }
    // Explicit nested mutations, transfers, and ordering independent of query iteration.
    const unit = [{ item: 'ore', quantity: 1 }];
    for (let n = processors; n < processors + owners; n += 10) {
      const e = records[n],
        other = records[n + 1];
      if (e.id === 'player' || other.id === 'player') continue;
      const from = tick % 2 ? other : e,
        to = tick % 2 ? e : other;
      if (!transfer(from.inventory!, to.inventory!, unit, content))
        throw new Error('Inventory transfer stopped');
      counters['transfers']++;
      ctx.mark(e, true);
      ctx.mark(other, true);
    }
    const player = ctx.get('player')!;
    for (let slot = 0; slot < 24; slot++)
      if (player.inventory!.slots[slot]?.item === 'ore') player.inventory!.slots[slot] = null;
    player.inventory!.slots[0] = { item: 'ore', quantity: 3 };
    const spent = spendByPriority(
      player.inventory!,
      [
        { id: 'research', priority: 'research', items: [{ item: 'ore', quantity: 2 }] },
        { id: 'manual', priority: 'manual', items: [{ item: 'ore', quantity: 2 }] },
        { id: 'intake', priority: 'minifab', items: [{ item: 'ore', quantity: 1 }] },
      ],
      content,
    );
    if (spent.join() !== 'manual,intake') throw new Error('Stock priority violation');
    const research = ctx.resources.research['fixture-research'];
    research.work += 0.05;
    research.consumed['ore'] += tick % 17 === 0 ? 1 : 0;
    for (let n = processors + owners + (tick % 10); n < size; n += 10) {
      const e = records[n];
      if (e.deposit) e.deposit.quantity = (e.deposit.quantity % 20000) + 1;
      if (e.pile) e.pile.quantity = (e.pile.quantity % 200) + 1;
      ctx.resources.extractionTotals['ore']++;
      ctx.mark(e);
    }
    // Rotate an active/idle pair without changing active counts (native membership operations).
    if (workload !== 'active') {
      const group = Math.floor(tick / 2) % Math.max(1, Math.floor(processors / 100));
      const a = records[group * 100],
        b = records[group * 100 + (workload === 'idle' ? 1 : 20)];
      const enabled = a.work!.status === 'active';
      a.work!.status = enabled ? 'idle' : 'active';
      b.work!.status = enabled ? 'active' : 'idle';
      ctx.membership(a, !enabled);
      ctx.membership(b, enabled);
    }
    if (workload === 'churn') {
      const count = Math.max(1, Math.floor(size * 0.01));
      const replacements = new Map<number, EntityData>();
      for (let offset = 0; offset < count; offset++) {
        const n = (tick * count + offset) % size;
        if (records[n].id === 'player') continue;
        replacements.set(n, entity(n, size, workload, tick + 1));
      }
      // Repair owner links before the single structural commit boundary.
      for (let n = 0; n < processors; n++) {
        const e = replacements.get(n) ?? records[n];
        const ownerOrdinal = processors + (n % owners);
        const owner =
          ownerOrdinal === processors
            ? 'player'
            : (replacements.get(ownerOrdinal) ?? records[ownerOrdinal]).id;
        if (e.owner !== owner && !replacements.has(n)) ctx.mark(records[n]);
        e.owner = owner;
      }
      for (const [n, replacement] of replacements) {
        ctx.replace(records[n].id, replacement);
        state.pending.push([n, replacement.id]);
        counters['replacements']++;
      }
    }
  };
}
