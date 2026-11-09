import { EQUIPMENT_BLUEPRINTS, canFabricate, RESEARCH_LAB_RULES } from '@content/first-factory';
import {
  FACTORY_SETTINGS as settings,
  MACHINES,
  RECYCLER_OUTCOMES,
  isPlaceable,
  MACHINE_FOOTPRINT,
  MACHINE_COLLISION,
} from '@content/factory';
import {
  OPENING_CONTENT,
  OPENING_RECIPES,
  OPENING_SETTINGS,
  OPENING_TECHNOLOGIES,
} from '@content/opening';
import type { FactoryCommand, FactorySummary, MachineData, MachineKind } from '@contracts/factory';
import type { ItemStack, WorldResources } from '@contracts/simulation';
import type { CommandResult, WorldDefinition } from '@contracts/world';
import { cellCenter, distanceToCell } from '@core/world-grid';
import { emptyInventory, planTransaction, quantity, transact } from './domain/inventory';
import { researchReady, type ResearchSource } from './domain/research';
import type { OpeningContext, SimulationEntity } from './opening-context';
import { validateFactoryPlacement } from './factory-placement';
import { machineMaterials } from '@content/machine-materials';
import { validatePowerConnection } from './power-connection';
import { TransportSystem } from './transport';
import { emptyTransport, isTransportKind } from '@content/transport';
import { isUtilityKind, isPipe } from '@content/environment';
import { newUtility, waterSpace } from './water';
import { EnvironmentSystem } from './environment';
import { EnergySystem } from './energy';
import { weatherFactors } from './weather';

export interface FactoryContext extends OpeningContext {
  readonly definition: WorldDefinition;
  readonly machines: Iterable<SimulationEntity>;
  readonly resources: WorldResources;
  deposits(): import('@contracts/world').DepositDefinition[];
}

const stacks = (bag: MachineData['input']): ItemStack[] =>
  bag.slots.flatMap((s) => (s ? [{ ...s }] : []));

const result = (reason: CommandResult['reason'] = null): CommandResult => ({
  accepted: reason === null,
  reason,
});

export function newMachine(kind: MachineKind, id: string, deposit: string | null): MachineData {
  let seed = 2166136261;
  for (const letter of id) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  return {
    ...(isUtilityKind(kind) ? { utility: newUtility() } : {}),
    enabled: true,
    recipe: null,
    deposit,
    input: emptyInventory(MACHINES[kind].inputSlots),
    output: emptyInventory(MACHINES[kind].outputSlots),
    job: null,
    random: { state: seed || 1, sequence: [], cursor: 0 },
    requested: 0,
    allocated: 0,
    status: 'idle',
  };
}

function nextOutcome(machine: MachineData): ItemStack[] {
  const random = machine.random;
  if (random.cursor === random.sequence.length) {
    random.sequence = RECYCLER_OUTCOMES.map((_, i) => i);
    random.cursor = 0;
    for (let i = random.sequence.length - 1; i > 0; i--) {
      let state = random.state;
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      random.state = state >>> 0;
      const j = random.state % (i + 1);
      [random.sequence[i], random.sequence[j]] = [random.sequence[j], random.sequence[i]];
    }
  }
  return RECYCLER_OUTCOMES[random.sequence[random.cursor++]].map((s) => ({ ...s }));
}

/** All stock, jobs and networks live on the existing ECS records. No clock or presentation APIs. */
export class FactorySystem {
  private readonly transport: TransportSystem;
  private readonly environment: EnvironmentSystem;
  private readonly energy: EnergySystem;
  public collisionChanged = false;
  private energyUsed = 0;
  private available = 0;
  private requested = 0;

  public constructor(private readonly context: FactoryContext) {
    this.transport = new TransportSystem(context);
    this.environment = new EnvironmentSystem(context);
    this.energy = new EnergySystem(context, this.environment);
  }

  private get bag() {
    return this.context.player.inventory!;
  }

  private get state() {
    return this.context.resources.factory!;
  }

  private list() {
    return [...this.context.machines]
      .filter((e) => e.building && e.machine)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  private near(entity: SimulationEntity): boolean {
    const p = entity.building?.position;
    const player = this.context.player.transform!.position;
    return (
      !!p &&
      distanceToCell(this.context.definition.grid, player, entity.building!.cell) <=
        OPENING_SETTINGS.reach + 1e-9
    );
  }

  public command(command: FactoryCommand): CommandResult {
    this.collisionChanged = false;
    const { player, resources, definition } = this.context;
    const machines = this.list();
    if (player.opening!.handcraft) return result('busy');
    if (
      command.type === 'fluid-connect' ||
      command.type === 'fluid-disconnect' ||
      command.type === 'fluid-overflow'
    )
      return this.environment.command(command);
    if (
      command.type === 'transport-connect' ||
      command.type === 'transport-disconnect' ||
      command.type === 'transport-configure' ||
      command.type === 'transport-collect'
    )
      return this.transport.command(command);
    if (command.type === 'factory-place-active') {
      const toolbar = player.opening!.toolbar;
      const equipment = toolbar?.slots[toolbar.active];
      if (!isPlaceable(equipment) || equipment === 'power-connection')
        return result('invalid-request');
      return this.command({
        type: 'factory-place',
        equipment,
        cell: command.cell,
        rotation: command.rotation,
      });
    }
    if (command.type === 'factory-place') {
      const blueprint = EQUIPMENT_BLUEPRINTS.find((b) => b.id === command.equipment)!;
      if (!resources.research[blueprint.technology]?.unlocked) return result('locked');
      const placement = validateFactoryPlacement(
        definition,
        {
          player: player.transform!,
          buildings: [...this.context.machines].flatMap((e) => (e.building ? [e.building] : [])),
          deposits: this.context.deposits(),
        },
        command.equipment,
        command.cell,
        command.rotation,
      );
      if (!placement.valid) return result(placement.reason);
      if (!transact(this.bag, [{ item: command.equipment, quantity: 1 }], [], OPENING_CONTENT))
        return result('missing-input');
      const id = this.context.allocateId('building');
      const position = cellCenter(definition.grid, command.cell);
      const deposit =
        command.equipment === 'extractor'
          ? this.context
              .deposits()
              .find((d) => d.position.x === position.x && d.position.z === position.z)!.id
          : null;
      this.context.add({
        id,
        kind: 'building',
        transform: { position: { ...position }, facing: 0, moving: false, sprinting: false },
        building: {
          id,
          buildingId: command.equipment,
          position,
          cell: { ...command.cell },
          rotation: command.rotation,
          footprint: { ...MACHINE_FOOTPRINT },
          ...(command.equipment === 'conveyor' || isPipe(command.equipment)
            ? {}
            : { collision: { ...MACHINE_COLLISION } }),
        },
        ...(isTransportKind(command.equipment)
          ? { transport: emptyTransport() }
          : { machine: newMachine(command.equipment, id, deposit) }),
      });
      this.collisionChanged = true;
    } else if (command.type === 'factory-connect' || command.type === 'factory-connect-active') {
      if (command.type === 'factory-connect-active') {
        const toolbar = player.opening!.toolbar;
        if (toolbar?.slots[toolbar.active] !== 'power-connection') return result('invalid-request');
      }
      const from = this.context.get(command.from),
        to = this.context.get(command.to);
      if (!from?.machine || !to?.machine) return result('out-of-reach');
      const validation = validatePowerConnection(
        definition,
        {
          player: player.transform!,
          buildings: machines.map((e) => e.building!),
          factory: { connections: this.state.connections },
        },
        from.id,
        to.id,
      );
      if (!validation.valid)
        return result(validation.reason === 'already-connected' ? 'busy' : 'out-of-reach');
      if (!resources.research['electrical-engineering']?.unlocked) return result('locked');
      if (!transact(this.bag, [{ item: 'power-connection', quantity: 1 }], [], OPENING_CONTENT))
        return result('missing-input');
      this.state.connections.push({
        id: this.context.allocateId('connection'),
        from: from.id,
        to: to.id,
      });
    } else if (command.type === 'factory-disconnect') {
      const connection = this.state.connections.find((c) => c.id === command.connection);
      if (
        !connection ||
        ![connection.from, connection.to].some((id) => this.near(this.context.get(id)!))
      )
        return result('out-of-reach');
      if (
        !transact(
          this.bag,
          [],
          [{ item: 'scrap', quantity: OPENING_CONTENT.items['power-connection'].solidValue }],
          OPENING_CONTENT,
        )
      )
        return result('capacity');
      this.state.connections = this.state.connections.filter((c) => c !== connection);
    } else {
      const target = this.context.get(command.target);
      if (target?.transport && command.type === 'factory-dismantle') {
        if (!this.near(target)) return result('out-of-reach');
        if (
          !transact(
            this.bag,
            [],
            [
              {
                item: 'scrap',
                quantity: OPENING_CONTENT.items[target.building!.buildingId].solidValue,
              },
              ...target.transport.units.map((u) => ({ item: u.item, quantity: 1 })),
            ],
            OPENING_CONTENT,
          )
        )
          return result('capacity');
        this.transport.detach(target.id);
        this.environment.detach(target);
        this.context.remove(target.id);
        this.collisionChanged = true;
        this.context.mark(player, true);
        return result();
      }
      if (!target?.machine || !this.near(target)) return result('out-of-reach');
      const machine = target.machine,
        kind = target.building!.buildingId as MachineKind;
      if (command.type === 'factory-configure') {
        const recipe = OPENING_RECIPES.find((r) => r.id === command.recipe);
        const tier =
          kind === 'basic-fabricator' ? 'basic' : kind === 'medium-fabricator' ? 'medium' : null;
        if (
          command.recipe !== null &&
          (!tier ||
            !recipe ||
            !canFabricate(
              recipe,
              tier,
              Object.keys(resources.research).filter((id) => resources.research[id].unlocked),
            ))
        )
          return result('invalid-request');
        if (machine.job && command.recipe !== machine.recipe) return result('busy');
        machine.enabled = command.enabled;
        machine.recipe = command.recipe;
      } else if (command.type === 'factory-collect-output') {
        const contents = stacks(machine.output);
        if (!contents.length) return result('missing-input');
        const bag = planTransaction(this.bag, [], contents, OPENING_CONTENT);
        if (!bag) return result('capacity');
        this.bag.slots = bag;
        machine.output.slots = machine.output.slots.map(() => null);
      } else if (command.type === 'factory-transfer') {
        if (!Object.hasOwn(OPENING_CONTENT.items, command.item)) return result('invalid-request');
        const buffer = machine[command.buffer],
          bundle = [{ item: command.item, quantity: command.quantity }];
        if (command.direction === 'load') {
          if (
            command.buffer !== 'input' ||
            !machineMaterials(kind, machine.recipe).input.includes(command.item)
          )
            return result('invalid-request');
          const bag = planTransaction(this.bag, bundle, [], OPENING_CONTENT);
          const dest = planTransaction(buffer, [], bundle, OPENING_CONTENT);
          if (!bag) return result('missing-input');
          if (!dest) return result('capacity');
          this.bag.slots = bag;
          buffer.slots = dest;
        } else {
          const source = planTransaction(buffer, bundle, [], OPENING_CONTENT),
            bag = planTransaction(this.bag, [], bundle, OPENING_CONTENT);
          if (!source) return result('missing-input');
          if (!bag) return result('capacity');
          buffer.slots = source;
          this.bag.slots = bag;
        }
      } else {
        const edges = this.state.connections.filter(
          (c) => c.from === target.id || c.to === target.id,
        );
        const material =
          OPENING_CONTENT.items[kind].solidValue +
          edges.length * OPENING_CONTENT.items['power-connection'].solidValue;
        // Extraction's prospective result still belongs to its deposit until the output commit.
        const contents = [
          ...stacks(machine.input),
          ...stacks(machine.output),
          ...(machine.job && kind !== 'extractor'
            ? machine.job.remaining > 0
              ? machine.job.inputs
              : machine.job.outputs
            : []),
        ];
        if (
          !transact(
            this.bag,
            [],
            [{ item: 'scrap', quantity: material }, ...contents],
            OPENING_CONTENT,
          )
        )
          return result('capacity');
        this.state.connections = this.state.connections.filter((c) => !edges.includes(c));
        this.transport.detach(target.id);
        this.environment.detach(target);
        this.context.remove(target.id);
        this.collisionChanged = true;
      }
      if (command.type !== 'factory-dismantle') this.context.mark(target, true);
    }
    this.context.mark(player, true);
    return result();
  }

  private labReady(machine: MachineData): boolean {
    const { resources, player } = this.context;
    const technology = OPENING_TECHNOLOGIES.find((t) => t.id === player.opening!.researchQueue[0]);
    if (
      !technology ||
      resources.research[technology.id]?.unlocked ||
      !researchReady(
        technology,
        resources.research,
        (item) =>
          (item === 'scrap' ? resources.extractionTotals : resources.productionTotals)[item] ?? 0,
      )
    )
      return false;
    return technology.costs
      .filter((s) => (resources.research[technology.id]?.consumed[s.item] ?? 0) < s.quantity)
      .every((s) => quantity(machine.input, s.item) >= 1);
  }

  public step(delta: number): readonly ResearchSource[] {
    this.collisionChanged = false;
    this.transport.step();
    this.environment.begin(delta);
    this.energyUsed = this.available = this.requested = 0;
    const machines = this.list();
    const parents = new Map(machines.map((e) => [e.id, e.id]));

    const root = (id: string): string => {
      let next = id;
      while (parents.get(next) !== next) next = parents.get(next)!;
      return next;
    };

    for (const edge of this.state.connections) {
      const a = root(edge.from),
        b = root(edge.to);
      if (a !== b) parents.set(b, a);
    }
    const demands = new Map<string, number>();
    for (const entity of machines) {
      const machine = entity.machine!,
        kind = entity.building!.buildingId as MachineKind,
        network = root(entity.id);
      machine.requested = machine.allocated = 0;
      machine.status = machine.enabled ? 'idle' : 'disabled';
      if (!machine.enabled || !MACHINES[kind].watts) continue;
      if (machine.job?.remaining === 0 && !this.commit(entity)) {
        machine.status = 'blocked';
        continue;
      }
      if (isUtilityKind(kind)) {
        if (!this.environment.demand(entity)) {
          machine.status =
            kind === 'water-pump' && waterSpace(entity) < 1e-8 ? 'blocked' : 'missing-input';
          continue;
        }
      } else if (kind === 'laboratory') {
        if (!this.labReady(machine)) {
          machine.status = 'missing-input';
          continue;
        }
      } else if (!machine.job && !this.prepare(entity)) continue;
      machine.requested = isUtilityKind(kind)
        ? this.environment.demand(entity)
        : MACHINES[kind].watts;
      demands.set(network, (demands.get(network) ?? 0) + machine.requested);
    }
    const supplies = this.energy.plan(
      machines,
      new Map(machines.map((e) => [e.id, root(e.id)])),
      delta,
    );
    this.available = [...supplies.values()].reduce((a, b) => a + b, 0);
    this.requested = [...demands.values()].reduce((a, b) => a + b, 0);
    const labs: ResearchSource[] = [];
    for (const entity of machines) {
      const machine = entity.machine!,
        kind = entity.building!.buildingId as MachineKind;
      if (machine.requested) {
        const network = root(entity.id),
          fraction = Math.min(1, (supplies.get(network) ?? 0) / demands.get(network)!);
        machine.allocated = machine.requested * fraction;
        machine.status = fraction ? 'working' : 'no-power';
        if (kind === 'laboratory' && fraction)
          labs.push({
            id: entity.id,
            kind: 'lab',
            inventory: machine.input,
            rate: RESEARCH_LAB_RULES.rate * fraction,
            onWork: (work) => {
              const joules = (work / RESEARCH_LAB_RULES.rate) * machine.requested;
              this.energyUsed += joules;
              this.energy.record(entity, joules);
              this.context.mark(entity, true);
            },
          });
        else if (isUtilityKind(kind) && fraction) {
          const joules = this.environment.work(entity, delta * fraction);
          this.energyUsed += joules;
          this.energy.record(entity, joules);
        } else if (machine.job && fraction) {
          const work = Math.min(machine.job.remaining, delta * fraction);
          machine.job.remaining = Math.max(0, machine.job.remaining - work);
          this.energyUsed += work * machine.requested;
          this.energy.record(entity, work * machine.requested);
          if (machine.job.remaining < 1e-9) {
            machine.job.remaining = 0;
            if (kind !== 'extractor') this.finishManufacture(entity);
            if (!this.commit(entity)) machine.status = 'blocked';
          }
        }
      }
      this.context.mark(entity, true);
    }
    return labs;
  }

  private prepare(entity: SimulationEntity): boolean {
    const machine = entity.machine!,
      kind = entity.building!.buildingId;
    if (kind === 'extractor') {
      const deposit = this.context.get(machine.deposit!)?.deposit;
      if (!deposit?.quantity) {
        machine.status = 'depleted';
        return false;
      }
      machine.job = {
        recipe: 'extract-scrap',
        remaining: settings.extractionSeconds,
        inputs: [],
        outputCommitted: false,
        outputs: [
          { item: deposit.kind, quantity: Math.min(settings.extractionQuantity, deposit.quantity) },
        ],
      };
      return true;
    }
    const recipe =
      kind === 'recycler'
        ? {
            id: 'recycle-scrap',
            seconds: settings.recyclerSeconds,
            inputs: [{ item: 'scrap', quantity: settings.recyclerInput }],
          }
        : OPENING_RECIPES.find((r) => r.id === machine.recipe);
    if (!recipe || !recipe.inputs.every((s) => quantity(machine.input, s.item) >= s.quantity)) {
      machine.status = 'missing-input';
      return false;
    }
    if (!transact(machine.input, recipe.inputs, [], OPENING_CONTENT)) return false;
    machine.job = {
      recipe: recipe.id,
      remaining: recipe.seconds,
      inputs: recipe.inputs.map((s) => ({ ...s })),
      outputCommitted: false,
      outputs:
        kind === 'recycler'
          ? nextOutcome(machine)
          : OPENING_RECIPES.find((r) => r.id === recipe.id)!.outputs.map((s) => ({ ...s })),
    };
    return true;
  }

  private commit(entity: SimulationEntity): boolean {
    const machine = entity.machine!,
      job = machine.job!;
    const extraction = entity.building!.buildingId === 'extractor';
    const deposit = extraction ? this.context.get(machine.deposit!) : undefined;
    if (extraction) {
      const count = Math.min(settings.extractionQuantity, deposit?.deposit?.quantity ?? 0);
      if (!count) {
        machine.job = null;
        machine.status = 'depleted';
        return true;
      }
      job.outputs = [{ item: deposit!.deposit!.kind, quantity: count }];
    }
    if (!transact(machine.output, [], job.outputs, OPENING_CONTENT)) return false;
    for (const stack of job.outputs) {
      if (extraction) {
        deposit!.deposit!.quantity -= stack.quantity;
        this.context.resources.extractionTotals[stack.item] =
          (this.context.resources.extractionTotals[stack.item] ?? 0) + stack.quantity;
        this.context.mark(deposit!);
        this.collisionChanged = true;
      }
    }
    machine.job = null;
    return true;
  }

  private finishManufacture(entity: SimulationEntity): void {
    const job = entity.machine!.job!;
    if (job.outputCommitted) return;
    // The one-operation pending buffer owns finished output even when the main buffer is full.
    job.outputCommitted = true;
    for (const stack of job.outputs)
      if (stack.item !== 'scrap')
        this.context.resources.productionTotals[stack.item] =
          (this.context.resources.productionTotals[stack.item] ?? 0) + stack.quantity;
  }

  public summary(): FactorySummary {
    const factors = weatherFactors(this.environment.state.weather, this.context.resources.tick);
    const used = this.energyUsed / 0.05;
    return {
      environment: this.environment.summary(),
      transport: this.transport.summary(),
      ...factors,
      available: this.available,
      requested: this.requested,
      used,
      curtailed: Math.max(0, this.environment.renewableAvailable - this.environment.renewableUsed),
      connections: this.state.connections.map((c) => ({ ...c })),
    };
  }

  public finishStep(delta: number): void {
    this.energy.settle(delta);
    this.environment.finish();
  }
}
