import { ENVIRONMENT_SETTINGS as settings } from '@content/environment';
import { FACTORY_SETTINGS } from '@content/factory';
import { OPENING_CONTENT } from '@content/opening';
import type { SimulationEntity } from './opening-context';
import type { FactoryContext } from './factory';
import { EnvironmentSystem } from './environment';
import { weatherFactors } from './weather';
import { consumeWater, waterQuality, waterVolume } from './water';
import { quantity, transact } from './domain/inventory';

interface NetworkPlan {
  id: string;
  entities: SimulationEntity[];
  renewable: number;
  coal: { entity: SimulationEntity; watts: number }[];
  batteries: SimulationEntity[];
  discharge: number;
  demand: number;
}

/** Dispatch plans capacity; final settlement charges fuel/storage against actual performed work. */
export class EnergySystem {
  private plans: NetworkPlan[] = [];
  private readonly used = new Map<string, number>();
  private roots = new Map<string, string>();

  public constructor(
    private readonly context: FactoryContext,
    private readonly environment: EnvironmentSystem,
  ) {}

  private renewables(entities: SimulationEntity[], tick: number): number {
    const factors = weatherFactors(
      this.environment.state.weather,
      tick,
      this.context.resources.tick,
    );
    return entities.reduce(
      (n, e) =>
        n +
        (!e.machine!.enabled
          ? 0
          : e.building!.buildingId === 'solar-panel'
            ? FACTORY_SETTINGS.solarWatts * factors.daylight
            : e.building!.buildingId === 'wind-turbine'
              ? (FACTORY_SETTINGS.windFloorWatts +
                  FACTORY_SETTINGS.windVariableWatts * factors.wind) *
                factors.windScale
              : 0),
      0,
    );
  }

  public record(entity: SimulationEntity, joules: number): void {
    const root = this.roots.get(entity.id)!;
    this.used.set(root, (this.used.get(root) ?? 0) + joules);
  }

  public plan(
    entities: SimulationEntity[],
    roots: Map<string, string>,
    delta: number,
  ): Map<string, number> {
    this.roots = roots;
    this.used.clear();
    this.plans = [];
    this.environment.pollutionRate = 0;
    this.environment.renewableAvailable =
      this.environment.renewableUsed =
      this.environment.coalUsed =
      this.environment.batteryRate =
      this.environment.forecastRenewable =
        0;
    const supplies = new Map<string, number>();
    for (const id of new Set(roots.values())) {
      const members = entities.filter((e) => roots.get(e.id) === id),
        batteries = members.filter(
          (e) => e.building!.buildingId === 'battery' && e.machine!.enabled,
        );
      const demand = members.reduce((n, e) => n + e.machine!.requested, 0),
        renewable = this.renewables(members, this.context.resources.tick);
      let forecast = Number.POSITIVE_INFINITY;
      for (let ahead = 0; ahead <= settings.forecastSeconds; ahead += 5)
        forecast = Math.min(
          forecast,
          this.renewables(members, this.context.resources.tick + ahead * 20),
        );
      const charging = batteries.reduce(
        (n, e) =>
          n +
          Math.min(
            settings.batteryWatts,
            Math.max(0, settings.batteryJoules - e.machine!.utility!.charge) /
              settings.forecastSeconds /
              settings.batteryEfficiency,
          ),
        0,
      );
      const coal: NetworkPlan['coal'] = [];
      for (const entity of members.filter((e) => e.building!.buildingId === 'coal-generator')) {
        const machine = entity.machine!,
          data = machine.utility!;
        const available =
          (data.fuelEnergy > 1e-8 || quantity(machine.input, 'coal') > 0) &&
          waterVolume(data.water) > 1e-8;
        const needed = machine.enabled && available && forecast < demand + charging - 1e-8;
        data.hold = Math.max(0, data.hold - delta);
        if (!available) {
          data.phase = 'off';
          data.transition = 0;
        } else if (data.phase === 'off' && needed && !data.hold) {
          data.phase = 'starting';
          data.transition = 0;
        } else if (data.phase === 'starting' && !needed) {
          data.phase = 'stopping';
          data.transition =
            (settings.coalStopSeconds * data.transition) / settings.coalStartSeconds;
        } else if (data.phase === 'running' && !needed && !data.hold) {
          data.phase = 'stopping';
          data.transition = settings.coalStopSeconds;
        }
        // A forecast reversal during shutdown reverses the ramp without a free full-output jump.
        else if (data.phase === 'stopping' && needed) {
          data.phase = 'starting';
          data.transition =
            (settings.coalStartSeconds * data.transition) / settings.coalStopSeconds;
        }
        if (data.phase === 'starting') {
          data.transition = Math.min(settings.coalStartSeconds, data.transition + delta);
          if (data.transition === settings.coalStartSeconds) {
            data.phase = 'running';
            data.hold = settings.coalHoldSeconds;
            data.transition = 0;
          }
        } else if (data.phase === 'stopping') {
          data.transition = Math.max(0, data.transition - delta);
          if (!data.transition) {
            data.phase = 'off';
            data.hold = settings.coalHoldSeconds;
          }
        }
        const ramp =
          data.phase === 'running'
            ? 1
            : data.phase === 'starting'
              ? data.transition / settings.coalStartSeconds
              : data.phase === 'stopping'
                ? data.transition / settings.coalStopSeconds
                : 0;
        const watts = Math.min(
          settings.coalWatts * ramp,
          (data.fuelEnergy + quantity(machine.input, 'coal') * settings.coalJoules) / delta,
          waterVolume(data.water) / settings.coalWaterPerJoule / delta,
        );
        coal.push({ entity, watts });
        data.generated = 0;
      }
      const discharge = batteries.reduce(
        (n, e) => n + Math.min(settings.batteryWatts, e.machine!.utility!.charge / delta),
        0,
      );
      this.plans.push({ id, entities: members, renewable, coal, batteries, discharge, demand });
      supplies.set(id, renewable + coal.reduce((n, c) => n + c.watts, 0) + discharge);
      this.environment.renewableAvailable += renewable;
      this.environment.forecastRenewable += forecast;
    }
    return supplies;
  }

  public settle(delta: number): void {
    for (const plan of this.plans) {
      const actual = (this.used.get(plan.id) ?? 0) / delta;
      const coalCapacity = plan.coal.reduce((n, c) => n + c.watts, 0);
      const deficit = Math.max(0, actual - plan.renewable - coalCapacity);
      let batteryOut = 0;
      if (deficit > 0) {
        const available = plan.discharge;
        for (const entity of plan.batteries) {
          const data = entity.machine!.utility!,
            limit = Math.min(settings.batteryWatts, data.charge / delta);
          const used = available
            ? Math.min(data.charge, ((deficit * limit) / available) * delta)
            : 0;
          data.charge = Math.max(0, data.charge - used);
          batteryOut += used / delta;
        }
      }
      const chargeCapacity =
        deficit > 0
          ? 0
          : plan.batteries.reduce(
              (n, e) =>
                n +
                Math.min(
                  settings.batteryWatts,
                  (settings.batteryJoules - e.machine!.utility!.charge) /
                    delta /
                    settings.batteryEfficiency,
                ),
              0,
            );
      const generated = Math.min(
        plan.renewable + coalCapacity,
        Math.max(0, actual - batteryOut) + chargeCapacity,
      );
      // Base load takes precedence; its slow transitions put the curtailment pressure on renewables.
      const coalUsed = Math.min(coalCapacity, generated),
        renewableUsed = Math.min(plan.renewable, Math.max(0, generated - coalUsed));
      const surplus = Math.max(0, generated - actual + batteryOut);
      if (surplus > 0 && chargeCapacity > 0)
        for (const entity of plan.batteries) {
          const data = entity.machine!.utility!,
            limit = Math.min(
              settings.batteryWatts,
              (settings.batteryJoules - data.charge) / delta / settings.batteryEfficiency,
            );
          data.charge = Math.min(
            settings.batteryJoules,
            data.charge + ((surplus * limit) / chargeCapacity) * delta * settings.batteryEfficiency,
          );
        }
      for (const coal of plan.coal) {
        const data = coal.entity.machine!.utility!,
          joules = coalCapacity ? ((coalUsed * coal.watts) / coalCapacity) * delta : 0;
        if (joules > data.fuelEnergy + 1e-8) {
          const count = Math.ceil((joules - data.fuelEnergy) / settings.coalJoules);
          if (
            !transact(
              coal.entity.machine!.input,
              [{ item: 'coal', quantity: count }],
              [],
              OPENING_CONTENT,
            )
          )
            throw new Error('Coal dispatch exceeded reserved fuel');
          data.fuelEnergy += count * settings.coalJoules;
        }
        data.fuelEnergy = Math.max(0, data.fuelEnergy - joules);
        const water = consumeWater(
          this.environment.state.sources,
          data.water,
          joules * settings.coalWaterPerJoule,
        );
        const quality = waterQuality(water);
        const emissions =
          joules *
          settings.coalPollutionPerJoule *
          (2 - quality / 100) *
          (this.context.resources.research['pollution-mitigation']?.unlocked ? 0.6 : 1);
        data.negative += emissions;
        this.environment.pollutionRate += emissions / delta;
        data.generated = joules / delta;
      }
      this.environment.renewableUsed += renewableUsed;
      this.environment.coalUsed += coalUsed;
      this.environment.batteryRate += surplus - batteryOut;
    }
  }
}
