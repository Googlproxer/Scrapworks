import type {
  EnvironmentResources,
  EnvironmentSummary,
  FluidConnection,
  FluidCommand,
  WaterBatch,
} from '@contracts/environment';
import type { CommandResult, WorldDefinition } from '@contracts/world';
import type { SimulationEntity } from './opening-context';
import type { FactoryContext } from './factory';
import {
  ENVIRONMENT_SETTINGS as settings,
  UTILITIES,
  isUtilityKind,
  fluidPorts,
} from '@content/environment';
import { facingPorts, portDirection } from '@content/transport';
import type { MaterialPort } from '@contracts/transport';
import { distanceToCell } from '@core/world-grid';
import { OPENING_SETTINGS } from '@content/opening';
import { addWater, lakeSources, takeWater, waterQuality, waterSpace, waterVolume } from './water';
import { advanceWeather, newWeather } from './weather';
import { restoreCells } from './restoration';

const epsilon = 1e-8;

export function newEnvironment(definition: WorldDefinition): EnvironmentResources {
  return {
    health: definition.terrain.map(() => 0),
    sources: lakeSources(definition),
    weather: newWeather(),
    connections: [],
    nextUpdate: settings.cadenceTicks,
    completed: false,
    completedTick: null,
  };
}

export class EnvironmentSystem {
  private mixed = false;
  private readonly bypassed = new Map<string, number>();
  private treatmentLimit = 0;
  public renewableAvailable = 0;
  public renewableUsed = 0;
  public coalUsed = 0;
  public batteryRate = 0;
  public forecastRenewable = 0;
  public pollutionRate = 0;
  public restorationRate = 0;

  public constructor(private readonly context: FactoryContext) {
    context.resources.environment ??= newEnvironment(context.definition);
  }

  public get state(): EnvironmentResources {
    return this.context.resources.environment!;
  }

  private list(): SimulationEntity[] {
    return [...this.context.machines]
      .filter((e) => e.machine?.utility && e.building)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  public sourceFor(entity: SimulationEntity): string | null {
    const b = entity.building!;
    const d = portDirection(b, 'front');
    const x = b.cell.column + d.column,
      z = b.cell.row + d.row;
    if (
      x < 0 ||
      z < 0 ||
      x >= this.context.definition.grid.columns ||
      z >= this.context.definition.grid.rows
    )
      return null;
    const index = z * this.context.definition.grid.columns + x;
    return this.state.sources.find((s) => s.cells.includes(index))?.id ?? null;
  }

  private near(entity: SimulationEntity): boolean {
    return (
      !!entity.building &&
      distanceToCell(
        this.context.definition.grid,
        this.context.player.transform!.position,
        entity.building.cell,
      ) <=
        OPENING_SETTINGS.reach + 1e-9
    );
  }

  public command(command: FluidCommand): CommandResult {
    const result = (reason: CommandResult['reason'] = null): CommandResult => ({
      accepted: reason === null,
      reason,
    });

    if (this.context.player.opening!.handcraft) return result('busy');
    if (!this.context.resources.research['water-treatment']?.unlocked) return result('locked');
    if (command.type === 'fluid-connect') {
      const a = this.context.get(command.from),
        b = this.context.get(command.to);
      if (!a?.machine?.utility || !b?.machine?.utility || !this.near(a) || !this.near(b))
        return result('out-of-reach');
      if (
        !fluidPorts(a.building!.buildingId).output.includes(command.output) ||
        !fluidPorts(b.building!.buildingId).input.includes(command.input) ||
        !facingPorts(a.building!, command.output, b.building!, command.input) ||
        this.state.connections.some(
          (e) =>
            (e.from === a.id && e.output === command.output) ||
            (e.to === b.id && e.input === command.input) ||
            (e.from === b.id && e.to === a.id),
        )
      )
        return result('invalid-request');
      this.state.connections.push({ ...command, id: this.context.allocateId('fluid') });
      // Persist only the connection contract, never the command discriminator.
      const edge = this.state.connections[this.state.connections.length - 1];
      this.state.connections[this.state.connections.length - 1] = {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        output: edge.output,
        input: edge.input,
      };
    } else if (command.type === 'fluid-disconnect') {
      const edge = this.state.connections.find((e) => e.id === command.connection);
      if (!edge || ![edge.from, edge.to].some((id) => this.near(this.context.get(id)!)))
        return result('out-of-reach');
      this.state.connections = this.state.connections.filter((e) => e !== edge);
    } else {
      const entity = this.context.get(command.target);
      if (
        !entity?.machine?.utility ||
        entity.building?.buildingId !== 'pipe-junction' ||
        !this.near(entity)
      )
        return result('out-of-reach');
      entity.machine.utility.overflow = command.direction;
      this.context.mark(entity, true);
    }
    return result();
  }

  private output(entity: SimulationEntity): WaterBatch[] {
    return entity.building!.buildingId === 'water-treatment'
      ? entity.machine!.utility!.clean
      : entity.machine!.utility!.water;
  }

  private eligibleWater(batches: readonly WaterBatch[], target: SimulationEntity): WaterBatch[] {
    return batches.filter(
      (b) => target.building!.buildingId !== 'greenhouse' || b.quality >= 100 - epsilon,
    );
  }

  private overflow(entity: SimulationEntity, port: MaterialPort): boolean {
    const direction = entity.machine!.utility!.overflow;
    if (!direction) return false;
    const d = portDirection(entity.building!, port);
    return (
      direction ===
      (d.column === 1 ? 'east' : d.column === -1 ? 'west' : d.row === 1 ? 'north' : 'south')
    );
  }

  private reachableSpace(
    id: string,
    batches: readonly WaterBatch[],
    visited = new Set<string>(),
    reserved = new Map<string, number>(),
  ): boolean {
    const entity = this.context.get(id);
    if (!entity?.machine?.utility || !entity.machine.enabled) return false;
    const eligible = this.eligibleWater(batches, entity);
    if (!eligible.some((b) => b.volume > 0)) return false;
    // A converging route may reach the same buffer before or after treatment.
    const key = JSON.stringify([
      id,
      eligible.some((b) => b.volume > 0 && b.quality >= 100 - epsilon),
    ]);
    if (visited.has(key)) return false;
    visited.add(key);
    if (waterSpace(entity) - (reserved.get(id) ?? 0) > epsilon) return true;
    const downstream =
      entity.building!.buildingId === 'water-treatment'
        ? eligible.map((b) => ({ ...b, quality: 100 }))
        : eligible;
    return this.state.connections.some(
      (e) =>
        e.from === id &&
        !this.overflow(entity, e.output) &&
        this.reachableSpace(e.to, downstream, visited, reserved),
    );
  }

  /** Contiguous plain pipe segments share level, with source fractions and quality intact. */
  private equalize(): void {
    const pipes = this.list().filter(
      (e) => e.building!.buildingId === 'pipe' && e.machine!.enabled,
    );
    const seen = new Set<string>();
    for (const start of pipes) {
      if (seen.has(start.id)) continue;
      const group = [start];
      seen.add(start.id);
      for (const current of group)
        for (const edge of this.state.connections) {
          const id = edge.from === current.id ? edge.to : edge.to === current.id ? edge.from : '';
          const next = pipes.find((e) => e.id === id);
          if (next && !seen.has(id)) {
            seen.add(id);
            group.push(next);
          }
        }
      if (group.length < 2) continue;
      const pool: WaterBatch[] = [];
      for (const entity of group) {
        addWater(pool, entity.machine!.utility!.water);
        entity.machine!.utility!.water = [];
      }
      const each = waterVolume(pool) / group.length;
      for (let at = 0; at < group.length; at++)
        group[at].machine!.utility!.water = takeWater(
          pool,
          at === group.length - 1 ? waterVolume(pool) : each,
        );
    }
  }

  private flow(delta: number): void {
    this.equalize();
    const entities = this.list(),
      byId = new Map(entities.map((e) => [e.id, e])),
      available = new Map(entities.map((e) => [e.id, this.output(e).map((b) => ({ ...b }))])),
      spaces = new Map(entities.map((e) => [e.id, waterSpace(e)])),
      budgets = new Map(
        entities.map((e) => [
          e.id,
          Math.min(waterVolume(this.output(e)), settings.pipeRate * delta),
        ]),
      ),
      arrivals = new Map<string, WaterBatch[]>();

    const allocate = (edges: readonly FluidConnection[]): void => {
      // Repeat after capacity clipping so unused shares reach other eligible ordinary routes.
      for (;;) {
        const counts = new Map<string, number>();
        const routes = edges.flatMap((edge) => {
          const from = byId.get(edge.from),
            to = byId.get(edge.to);
          if (
            !from?.machine!.enabled ||
            !to?.machine!.enabled ||
            budgets.get(from.id)! <= 0 ||
            spaces.get(to.id)! <= epsilon
          )
            return [];
          const eligible = this.eligibleWater(available.get(from.id)!, to),
            volume = waterVolume(eligible);
          if (volume <= 0) return [];
          counts.set(from.id, (counts.get(from.id) ?? 0) + 1);
          return [{ from, to, eligible, volume }];
        });
        const proposed = new Map<string, number>();
        const offers = routes.map((route) => {
          const amount =
            Math.min(route.volume, budgets.get(route.from.id)!) / counts.get(route.from.id)!;
          proposed.set(route.to.id, (proposed.get(route.to.id) ?? 0) + amount);
          return { ...route, amount };
        });
        const fractions = new Map(
          [...proposed].map(([id, amount]) => [id, Math.min(1, spaces.get(id)! / amount)]),
        );
        let moved = 0;
        for (const offer of offers) {
          const batches = takeWater(offer.eligible, offer.amount * fractions.get(offer.to.id)!),
            volume = waterVolume(batches);
          budgets.set(offer.from.id, Math.max(0, budgets.get(offer.from.id)! - volume));
          spaces.set(offer.to.id, Math.max(0, spaces.get(offer.to.id)! - volume));
          const incoming = arrivals.get(offer.to.id) ?? [];
          addWater(incoming, batches);
          arrivals.set(offer.to.id, incoming);
          moved += volume;
        }
        if (moved <= epsilon) break;
      }
    };

    const normal = this.state.connections.filter((edge) => {
      const from = byId.get(edge.from);
      return from && !this.overflow(from, edge.output);
    });
    allocate(normal);
    const reserved = new Map(entities.map((e) => [e.id, waterSpace(e) - spaces.get(e.id)!]));
    const overflow = this.state.connections.filter((edge) => {
      const from = byId.get(edge.from);
      return (
        from &&
        this.overflow(from, edge.output) &&
        !normal.some(
          (e) =>
            e.from === from.id &&
            this.reachableSpace(e.to, available.get(from.id)!, new Set(), reserved),
        )
      );
    });
    allocate(overflow);

    // Commit only phase-start withdrawals before adding arrivals; no new litre crosses two edges.
    for (const entity of entities) {
      const remaining = available.get(entity.id)!.filter((b) => b.volume > 0);
      if (entity.building!.buildingId === 'water-treatment')
        entity.machine!.utility!.clean = remaining;
      else entity.machine!.utility!.water = remaining;
    }
    for (const [id, batches] of arrivals) addWater(byId.get(id)!.machine!.utility!.water, batches);
    this.equalize();
  }

  public begin(delta: number): void {
    if (!this.mixed) {
      for (const entity of this.list()) {
        const data = entity.machine!.utility!,
          water: WaterBatch[] = [],
          clean: WaterBatch[] = [];
        addWater(water, data.water);
        addWater(clean, data.clean);
        data.water = water;
        data.clean = clean;
      }
      this.mixed = true;
    }
    this.bypassed.clear();
    this.treatmentLimit = settings.treatmentRate * delta;
    this.restorationRate = 0;
    const tick = this.context.resources.tick;
    advanceWeather(this.state.weather, tick);
    for (const source of this.state.sources) {
      const outstanding = source.extracted - source.consumed - source.returned;
      const refill = Math.min(
        Math.max(
          0,
          source.cells.length * settings.sourceLitresPerCell - source.volume - outstanding,
        ),
        source.cells.length *
          (this.state.weather.kind === 'rain'
            ? settings.rainRefillPerCell
            : settings.refillPerCell) *
          delta,
      );
      source.volume += refill;
      source.refilled += refill;
    }
    for (const entity of this.list())
      if (
        entity.building!.buildingId === 'water-pump' ||
        entity.building!.buildingId === 'water-return'
      )
        entity.machine!.utility!.source = this.sourceFor(entity);
    this.flow(delta);
    for (const entity of this.list()) {
      if (!entity.machine!.enabled) continue;
      const data = entity.machine!.utility!,
        kind = entity.building!.buildingId;
      if (kind === 'water-return')
        this.returnWater(
          data.water,
          Math.min(settings.returnRate * delta, waterVolume(data.water)),
          true,
          data.source,
        );
      if (kind === 'water-treatment') {
        const clean = data.water.filter((b) => b.quality >= 100 - epsilon);
        const amount = Math.min(waterVolume(clean), this.treatmentLimit);
        this.bypassed.set(entity.id, amount);
        // A clean batch bypasses treatment with no electricity/work charge.
        const fraction = waterVolume(clean) ? amount / waterVolume(clean) : 0;
        for (const batch of clean) {
          addWater(data.clean, [{ ...batch, volume: batch.volume * fraction }]);
          batch.volume *= 1 - fraction;
        }
        data.water = data.water.filter((b) => b.volume > 0);
      }
    }
  }

  public demand(entity: SimulationEntity): number {
    const kind = entity.building!.buildingId,
      data = entity.machine!.utility!;
    if (!isUtilityKind(kind) || !entity.machine!.enabled) return 0;
    if (kind === 'water-pump')
      return data.source &&
        this.state.sources.find((s) => s.id === data.source)!.volume > epsilon &&
        waterSpace(entity) > epsilon
        ? UTILITIES[kind].watts
        : 0;
    if (kind === 'water-treatment')
      return data.water.some((b) => b.quality < 100 - epsilon) &&
        (this.bypassed.get(entity.id) ?? 0) < this.treatmentLimit - epsilon
        ? UTILITIES[kind].watts *
            (1 - waterQuality(data.water.filter((b) => b.quality < 100 - epsilon)) / 100)
        : 0;
    if (kind === 'greenhouse')
      return data.water.some((b) => b.quality >= 100 - epsilon) ? UTILITIES[kind].watts : 0;
    return kind === 'air-scrubber' ? UTILITIES[kind].watts : 0;
  }

  /** Returns actual joules of work, including supply-limited final fractions. */
  public work(entity: SimulationEntity, seconds: number): number {
    const kind = entity.building!.buildingId,
      data = entity.machine!.utility!;
    if (!isUtilityKind(kind) || seconds <= 0) return 0;
    const previousInfluence = data.positive;
    if (kind === 'water-pump') {
      const source = this.state.sources.find((s) => s.id === data.source)!;
      const volume = Math.min(settings.pumpRate * seconds, source.volume, waterSpace(entity));
      const quality =
        source.cells.reduce((n, i) => n + this.state.health[i], 0) / source.cells.length;
      addWater(data.water, [{ source: source.id, volume, quality }]);
      source.volume -= volume;
      source.extracted += volume;
      seconds = volume / settings.pumpRate;
    } else if (kind === 'water-treatment') {
      const raw = data.water.filter((b) => b.quality < 100 - epsilon);
      const costFraction = 1 - waterQuality(raw) / 100;
      // Free bypass consumes throughput; allocated power limits only dirty treatment.
      const amount = Math.min(
        waterVolume(raw),
        settings.treatmentRate * seconds,
        Math.max(0, this.treatmentLimit - (this.bypassed.get(entity.id) ?? 0)),
      );
      const fraction = waterVolume(raw) ? amount / waterVolume(raw) : 0;
      for (const batch of raw) {
        addWater(data.clean, [{ ...batch, quality: 100, volume: batch.volume * fraction }]);
        batch.volume *= 1 - fraction;
      }
      data.water = data.water.filter((b) => b.volume > 0);
      seconds = (amount / settings.treatmentRate) * costFraction;
    } else if (kind === 'greenhouse') {
      const clean = data.water.filter((b) => b.quality >= 100 - epsilon);
      seconds = Math.min(seconds, waterVolume(clean) / settings.greenhouseWater);
      const amount = seconds * settings.greenhouseWater,
        total = waterVolume(clean);
      for (const batch of clean) {
        const used = (amount * batch.volume) / total;
        batch.volume -= used;
        this.state.sources.find((s) => s.id === batch.source)!.consumed += used;
      }
      data.water = data.water.filter((b) => b.volume > 0);
      data.positive += settings.greenhouseInfluence * seconds;
    } else if (kind === 'air-scrubber') data.positive += settings.scrubberInfluence * seconds;
    this.restorationRate +=
      (data.positive - previousInfluence) / this.context.resources.stepSeconds;
    return seconds * UTILITIES[kind].watts;
  }

  public returnWater(
    batches: WaterBatch[],
    amount = waterVolume(batches),
    improve = false,
    targetId: string | null = null,
  ): void {
    const target = targetId ? this.state.sources.find((s) => s.id === targetId) : undefined;
    if (target) {
      const external = waterVolume(batches.filter((b) => b.source !== target.id)),
        total = waterVolume(batches);
      const room = Math.max(
        0,
        target.cells.length * settings.sourceLitresPerCell -
          target.volume -
          (target.extracted - target.consumed - target.returned),
      );
      if (external > epsilon) amount = Math.min(amount, (room * total) / external);
    }
    for (const batch of takeWater(batches, amount)) {
      const source = this.state.sources.find((s) => s.id === batch.source)!;
      const receiving = target ?? source;
      if (improve) {
        const mean =
          receiving.cells.reduce((n, i) => n + this.state.health[i], 0) / receiving.cells.length;
        const gain =
          (batch.volume * settings.returnInfluence * Math.max(0, (batch.quality - mean) / 100)) /
          receiving.cells.length;
        for (const cell of receiving.cells)
          this.state.health[cell] = Math.min(100, this.state.health[cell] + gain);
      }
      receiving.volume += batch.volume;
      source.returned += batch.volume;
      if (receiving !== source) {
        source.transferredOut += batch.volume;
        receiving.transferredIn += batch.volume;
      }
    }
  }

  public detach(entity: SimulationEntity): void {
    const connected = new Set([entity.id]);
    for (const id of connected)
      for (const edge of this.state.connections) {
        if (edge.from === id) connected.add(edge.to);
        if (edge.to === id) connected.add(edge.from);
      }
    // Dismantling drains the affected connected system, including disabled branches.
    for (const id of connected) {
      const affected = this.context.get(id),
        data = affected?.machine?.utility;
      if (!data) continue;
      this.returnWater(data.water);
      this.returnWater(data.clean);
      this.context.mark(affected!, true);
    }
    this.state.connections = this.state.connections.filter(
      (e) => e.from !== entity.id && e.to !== entity.id,
    );
  }

  public finish(): void {
    const tick = this.context.resources.tick + 1;
    if (tick >= this.state.nextUpdate) {
      const influences = this.list().map((e) => ({
        id: e.id,
        cell: e.building!.cell.row * this.context.definition.grid.columns + e.building!.cell.column,
        positive: e.machine!.utility!.positive,
        negative: e.machine!.utility!.negative,
      }));
      restoreCells(this.state.health, this.context.definition.grid.columns, influences);
      for (const e of this.list()) {
        e.machine!.utility!.positive = 0;
        e.machine!.utility!.negative = 0;
      }
      this.state.nextUpdate = tick + settings.cadenceTicks;
      if (!this.state.completed && this.state.health.every((h) => h >= 100 - epsilon)) {
        this.state.health.fill(100);
        this.state.completed = true;
        this.state.completedTick = tick;
      }
    }
    for (const e of this.list()) this.context.mark(e, true);
  }

  public summary(): EnvironmentSummary {
    const batteries = this.list().filter((e) => e.building!.buildingId === 'battery');
    return {
      columns: this.context.definition.grid.columns,
      health: [...this.state.health],
      sources: structuredClone(this.state.sources),
      connections: this.state.connections.map((e) => ({ ...e })),
      weather: { ...this.state.weather },
      average: this.state.health.reduce((n, h) => n + h, 0) / this.state.health.length,
      restored: this.state.health.filter((h) => h >= 100 - epsilon).length,
      completed: this.state.completed,
      storedEnergy: batteries.reduce((n, e) => n + e.machine!.utility!.charge, 0),
      storageCapacity: batteries.length * settings.batteryJoules,
      renewableAvailable: this.renewableAvailable,
      renewableUsed: this.renewableUsed,
      coalUsed: this.coalUsed,
      batteryRate: this.batteryRate,
      forecastRenewable: this.forecastRenewable,
      pollutionRate: this.pollutionRate,
      restorationRate: this.restorationRate,
    };
  }
}
