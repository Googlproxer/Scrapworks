import { OPENING_CONTENT, OPENING_SETTINGS } from '@content/opening';
import { isMachineKind } from '@content/factory';
import { machineMaterials } from '@content/machine-materials';
import {
  facingPorts,
  lanePort,
  materialPorts,
  sorterLane,
  TRANSPORT_SETTINGS as settings,
} from '@content/transport';
import type {
  MaterialConnection,
  MaterialPort,
  TransitUnit,
  TransportCommand,
  TransportSummary,
} from '@contracts/transport';
import type { EntityData, InventoryData, ItemStack } from '@contracts/simulation';
import type { CommandResult } from '@contracts/world';
import { distanceToCell } from '@core/world-grid';
import type { FactoryContext } from './factory';
import type { SimulationEntity } from './opening-context';
import { planTransaction, transact } from './domain/inventory';

const result = (reason: CommandResult['reason'] = null): CommandResult => ({
  accepted: reason === null,
  reason,
});

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Geometry validation is shared with player-facing connection previews and untrusted saves. */
export function materialConnectionProblem(
  entities: readonly (Pick<EntityData, 'id' | 'building'> & {
    transport?: { readonly turn: import('@contracts/transport').ConveyorTurn };
  })[],
  connections: readonly Readonly<MaterialConnection>[],
  from: string,
  output: MaterialPort,
  to: string,
  input: MaterialPort,
): string | null {
  const a = entities.find((e) => e.id === from),
    b = entities.find((e) => e.id === to);
  if (!a?.building) return 'Choose a placed source.';
  if (!b?.building) return 'Choose a placed destination.';
  if (!materialPorts(a.building.buildingId, a.transport?.turn).output.includes(output))
    return 'This side has no output port.';
  if (!materialPorts(b.building.buildingId, b.transport?.turn).input.includes(input))
    return 'This side has no input port.';
  if (!facingPorts(a.building, output, b.building, input))
    return 'Ports must face each other on neighbouring cells.';
  if (connections.some((c) => c.from === from && c.output === output))
    return 'The source output already has a connection.';
  if (connections.some((c) => c.to === to && c.input === input))
    return 'The destination input already has a connection.';
  return null;
}

export function materialConnectionValid(
  ...args: Parameters<typeof materialConnectionProblem>
): boolean {
  return materialConnectionProblem(...args) === null;
}

/** Same worker/clock/stock authority as production. No renderer, storage, RxJS or wall clock. */
export class TransportSystem {
  public constructor(private readonly context: FactoryContext) {
    context.resources.factory!.transport ??= { connections: [], cursors: {} };
  }

  private get state() {
    return this.context.resources.factory!.transport!;
  }

  private entities() {
    return [...this.context.machines].filter((e) => e.building).sort((a, b) => compare(a.id, b.id));
  }

  private near(e: SimulationEntity) {
    return (
      !!e.building &&
      distanceToCell(
        this.context.definition.grid,
        this.context.player.transform!.position,
        e.building.cell,
      ) <=
        OPENING_SETTINGS.reach + 1e-9
    );
  }

  public detach(id: string): void {
    const removed = this.state.connections.filter((c) => c.from === id || c.to === id);
    this.state.connections = this.state.connections.filter((c) => !removed.includes(c));
    for (const [target, edge] of Object.entries(this.state.cursors))
      if (target === id || removed.some((c) => c.id === edge)) delete this.state.cursors[target];
  }

  public command(command: TransportCommand): CommandResult {
    const { player, resources } = this.context;
    if (player.opening!.handcraft) return result('busy');
    if (!resources.research['sorting-logistics']?.unlocked) return result('locked');
    if (command.type === 'transport-connect') {
      const from = this.context.get(command.from),
        to = this.context.get(command.to);
      if (!from || !to || !this.near(from) || !this.near(to)) return result('out-of-reach');
      if (
        !materialConnectionValid(
          this.entities(),
          this.state.connections,
          command.from,
          command.output,
          command.to,
          command.input,
        )
      )
        return result('invalid-request');
      // Configured machine compatibility is enforced again for every offered item at commit.
      if (
        from.machine &&
        to.machine &&
        !machineMaterials(
          from.building!.buildingId as import('@contracts/factory').MachineKind,
          from.machine.recipe,
        ).output.some((item) => this.accepts(to, item))
      )
        return result('invalid-request');
      this.state.connections.push({
        id: this.context.allocateId('material'),
        from: command.from,
        output: command.output,
        to: command.to,
        input: command.input,
        // Reconnecting cannot reset the port into an immediate extra transfer.
        cooldown: settings.intervalTicks,
        lastItem: null,
      });
    } else if (command.type === 'transport-disconnect') {
      const edge = this.state.connections.find((c) => c.id === command.connection);
      if (
        !edge ||
        ![edge.from, edge.to].some((id) => {
          const e = this.context.get(id);
          return e && this.near(e);
        })
      )
        return result('out-of-reach');
      this.state.connections = this.state.connections.filter((c) => c !== edge);
      for (const [target, id] of Object.entries(this.state.cursors))
        if (id === edge.id) delete this.state.cursors[target];
    } else {
      const target = this.context.get(command.target);
      if (!target?.transport || !this.near(target)) return result('out-of-reach');
      const transport = target.transport;
      if (command.type === 'transport-configure') {
        if (
          command.filters.some(
            (item) => item !== null && !Object.hasOwn(OPENING_CONTENT.items, item),
          ) ||
          (command.filters[0] !== null && command.filters[0] === command.filters[1])
        )
          return result('invalid-request');
        if (
          target.building!.buildingId === 'conveyor' &&
          command.filters.some((item) => item !== null)
        )
          return result('invalid-request');
        if (target.building!.buildingId === 'sorter' && command.turn !== 'straight')
          return result('invalid-request');
        // Held units keep their destination. Empty before changing filters; no silent rerouting.
        if (
          transport.units.length &&
          JSON.stringify(transport.filters) !== JSON.stringify(command.filters)
        )
          return result('busy');
        const ports = materialPorts(target.building!.buildingId, command.turn);
        if (
          this.state.connections.some(
            (c) => c.from === target.id && !ports.output.includes(c.output),
          )
        )
          return result('busy');
        transport.turn = command.turn;
        transport.filters = [...command.filters];
      } else {
        const contents = transport.units.map((u) => ({ item: u.item, quantity: 1 }));
        if (!contents.length) return result('missing-input');
        if (!transact(player.inventory!, [], contents, OPENING_CONTENT)) return result('capacity');
        transport.units = [];
      }
      this.context.mark(target, true);
    }
    this.context.mark(player, true);
    return result();
  }

  private accepts(target: SimulationEntity, item: string): boolean {
    if (target.transport) return true;
    const kind = target.building?.buildingId;
    return (
      !!target.machine &&
      isMachineKind(kind) &&
      machineMaterials(kind, target.machine.recipe).input.includes(item)
    );
  }

  public step(): void {
    const entities = this.entities(),
      byId = new Map(entities.map((e) => [e.id, e]));
    const taken = new Set<TransitUnit>();
    const incoming = new Map<string, TransitUnit[]>();
    const sourceBags = new Map<string, InventoryData>();
    const destBags = new Map<string, InventoryData>();
    const served = new Set<string>();
    // Progress advances only on already-owned units. New arrivals cannot be offered this phase.
    for (const e of entities)
      for (const u of e.transport?.units ?? [])
        u.progress = Math.min(settings.travelTicks, u.progress + 1);
    for (const c of this.state.connections) c.cooldown = Math.max(0, c.cooldown - 1);
    const groups = new Map<string, MaterialConnection[]>();
    for (const edge of [...this.state.connections].sort((a, b) => compare(a.id, b.id))) {
      const group = groups.get(edge.to) ?? [];
      group.push(edge);
      groups.set(edge.to, group);
    }
    for (const [id, edges] of [...groups].sort(([a], [b]) => compare(a, b))) {
      const last = edges.findIndex((e) => e.id === this.state.cursors[id]);
      const ordered = [...edges.slice(last + 1), ...edges.slice(0, last + 1)];
      const target = byId.get(id)!;
      for (const edge of ordered) {
        if (edge.cooldown) continue;
        const source = byId.get(edge.from)!;
        const candidates = source.transport
          ? source.transport.units
              .filter(
                (u) =>
                  u.progress >= settings.travelTicks &&
                  !taken.has(u) &&
                  (source.building!.buildingId === 'conveyor' || lanePort(u.lane) === edge.output),
              )
              .map((u) => ({ item: u.item, unit: u }))
          : [...new Set(source.machine!.output.slots.flatMap((s) => (s ? [s.item] : [])))]
              .sort(compare)
              .map((item) => ({ item, unit: undefined }));
        const lastItem = candidates.findIndex((c) => c.item === edge.lastItem);
        const offers = [...candidates.slice(lastItem + 1), ...candidates.slice(0, lastItem + 1)];
        for (const offer of offers) {
          if (!this.accepts(target, offer.item)) continue;
          const bundle: ItemStack[] = [{ item: offer.item, quantity: 1 }];
          let deduction: (ItemStack | null)[] | null = null;
          if (source.machine) {
            const bag = sourceBags.get(source.id) ?? structuredClone(source.machine.output);
            deduction = planTransaction(bag, bundle, [], OPENING_CONTENT);
            if (!deduction) continue;
          }
          const arrivals = incoming.get(id) ?? [];
          const lane =
            target.building!.buildingId === 'sorter'
              ? sorterLane(target.transport!.filters, offer.item)
              : 0;
          let addition: (ItemStack | null)[] | null = null;
          if (target.transport) {
            if (
              [...target.transport.units, ...arrivals].filter((u) => u.lane === lane).length >=
              settings.capacity
            )
              continue;
          } else {
            const bag = destBags.get(id) ?? structuredClone(target.machine!.input);
            addition = planTransaction(bag, [], bundle, OPENING_CONTENT);
            if (!addition) continue;
          }
          if (source.machine) sourceBags.set(source.id, { slots: deduction! });
          if (offer.unit) taken.add(offer.unit);
          if (target.transport) {
            arrivals.push({ item: offer.item, lane, progress: 0 });
            incoming.set(id, arrivals);
          } else destBags.set(id, { slots: addition! });
          edge.cooldown = settings.intervalTicks;
          edge.lastItem = offer.item;
          this.state.cursors[id] = edge.id;
          served.add(`${source.id}:${edge.output}`);
          break;
        }
      }
    }
    // All proposals read phase-start containers; commit deductions and additions together.
    for (const e of entities) {
      if (sourceBags.has(e.id)) e.machine!.output = sourceBags.get(e.id)!;
      if (destBags.has(e.id)) e.machine!.input = destBags.get(e.id)!;
      if (e.transport) {
        e.transport.units = [
          ...e.transport.units.filter((u) => !taken.has(u)),
          ...(incoming.get(e.id) ?? []),
        ];
        const outgoing = this.state.connections.filter((c) => c.from === e.id);
        const transport = e.transport;
        const waiting = transport.units.filter((u) => u.progress >= settings.travelTicks);
        const incompatible = waiting.some((u) => {
          const port =
            e.building!.buildingId === 'sorter'
              ? lanePort(u.lane)
              : materialPorts('conveyor', transport.turn).output[0];
          const edge = outgoing.find((c) => c.output === port),
            target = edge && byId.get(edge.to);
          return target && !this.accepts(target, u.item);
        });
        transport.status = !transport.units.length
          ? 'idle'
          : !outgoing.length
            ? 'disconnected'
            : incompatible
              ? 'incompatible'
              : transport.units.some(
                    (u) =>
                      u.progress >= settings.travelTicks &&
                      !served.has(
                        `${e.id}:${e.building!.buildingId === 'sorter' ? lanePort(u.lane) : materialPorts('conveyor', transport.turn).output[0]}`,
                      ),
                  )
                ? 'blocked'
                : 'moving';
      }
      if (e.transport || sourceBags.has(e.id) || destBags.has(e.id)) this.context.mark(e, true);
    }
  }

  public summary(): TransportSummary {
    return {
      connections: this.state.connections.map((c) => ({ ...c })),
      segments: this.entities().flatMap((e) =>
        e.transport ? [{ id: e.id, ...structuredClone(e.transport) }] : [],
      ),
    };
  }
}
