import type { OpeningEvent, MiniFabStatus } from '@contracts/session-event';
import type { OpeningCommand, OpeningData, OpeningView } from '@contracts/opening';
import type { CommandResult, WorldPosition } from '@contracts/world';
import type { ItemStack, InventoryData } from '@contracts/simulation';
import type { SimulationEntity, OpeningContext } from './opening-context';
import {
  OPENING_CONTENT,
  OPENING_RECIPES,
  OPENING_SETTINGS as settings,
  OPENING_TECHNOLOGIES,
  chargeCapacity,
  turnsToFull,
  validateOpeningCatalogue,
} from '../content/opening';
import type { OpeningRecipe } from '../content/opening';
import { available, planTransaction, transact } from './domain/inventory';
import { handcraftBagOutput } from './domain/work';

const copy = (items: readonly ItemStack[]): ItemStack[] => items.map((item) => ({ ...item }));

const signature = (items: readonly ItemStack[]): string =>
  [...new Set(items.map((item) => item.item))].sort().join('|');

const distance = (a: WorldPosition, b: WorldPosition): number => Math.hypot(a.x - b.x, a.z - b.z);

const recipeById = (id: string): OpeningRecipe | undefined =>
  OPENING_RECIPES.find((recipe) => recipe.id === id);

const take = (items: readonly ItemStack[], requested: readonly ItemStack[]): ItemStack[] => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.item, (counts.get(item.item) ?? 0) + item.quantity);
  for (const item of requested) counts.set(item.item, (counts.get(item.item) ?? 0) - item.quantity);
  return [...counts].flatMap(([item, count]) => (count > 0 ? [{ item, quantity: count }] : []));
};

export function newOpening(): OpeningData {
  return {
    salvage: null,
    handcraft: null,
    handcraftVisible: false,
    handcraftSuspended: false,
    fieldTechnology: null,
    fieldEnabled: false,
    moved: false,
    minifab: {
      owned: false,
      request: null,
      job: null,
      input: [],
      output: [],
      outputRecipe: null,
      charge: 0,
      capacityLevel: 0,
      gearing: 0,
      windBudget: 180,
      status: 'unowned',
    },
  };
}

/** Executors operate exclusively on the player ECS component and shared atomic slot rules. */
export class OpeningSystem {
  public collisionChanged = false;
  private events: OpeningEvent[] = [];

  public drainEvents(): OpeningEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private setMiniStatus(status: MiniFabStatus): void {
    if (this.state.minifab.status === status) return;
    this.state.minifab.status = status;
    this.events.push({
      kind: 'minifab-status',
      status,
      recipe: this.state.minifab.job?.recipe ?? this.state.minifab.request?.recipe ?? null,
    });
  }

  private readonly context: OpeningContext;

  public constructor(context: OpeningContext) {
    this.context = context;
    validateOpeningCatalogue();
  }

  private get player(): SimulationEntity {
    return this.context.player;
  }

  private get state(): OpeningData {
    return this.player.opening!;
  }

  private get bag(): InventoryData {
    return this.player.inventory!;
  }

  private unlocked(recipe: OpeningRecipe): boolean {
    return !!this.context.resources.research[recipe.technology]?.unlocked;
  }

  private id(): string {
    let id: string;
    do {
      id = this.context.allocateId('opening-job');
    } while (this.state.handcraft?.id === id || this.state.minifab.job?.id === id);
    return id;
  }

  private result(reason: CommandResult['reason'] = null): CommandResult {
    return { accepted: reason === null, reason };
  }

  public interrupt(): void {
    this.state.salvage = null;
    this.state.handcraftSuspended = false;
    this.cancelHandcraft();
    this.state.handcraftVisible = false;
    this.context.mark(this.player, true);
  }

  public command(command: OpeningCommand): CommandResult {
    const state = this.state,
      mini = state.minifab;
    const target =
      'target' in command && command.target ? this.context.get(command.target) : undefined;
    const near =
      target?.transform &&
      distance(target.transform.position, this.player.transform!.position) <= settings.reach;
    switch (command.type) {
      case 'salvage':
        if (!command.target) {
          state.salvage = null;
          break;
        }
        if (state.handcraft) return this.result('busy');
        if (!target?.deposit || !near) return this.result('out-of-reach');
        if (!target.deposit.quantity) return this.result('depleted');
        if (state.salvage?.target !== target.id)
          state.salvage = { target: target.id, remaining: this.salvageDuration() };
        break;
      case 'pickup': {
        if (state.handcraft) return this.result('busy');
        if (!target?.pile || !near || !target.pile.quantity) return this.result('out-of-reach');
        const count = this.fitting(target.pile.item, target.pile.quantity);
        if (!count) return this.result('capacity');
        transact(this.bag, [], [{ item: target.pile.item, quantity: count }], OPENING_CONTENT);
        target.pile.quantity -= count;
        if (target.pile.quantity) this.context.mark(target);
        else this.context.remove(target.id);
        break;
      }
      case 'equip': {
        if (state.handcraft) return this.result('busy');
        if (command.item !== null && command.item !== 'prybar')
          return this.result('invalid-request');
        const current = this.player.equipment!.tool;
        if (current === command.item) return this.result();
        if (
          !transact(
            this.bag,
            command.item ? [{ item: command.item, quantity: 1 }] : [],
            current ? [{ item: current, quantity: 1 }] : [],
            OPENING_CONTENT,
          )
        )
          return this.result('capacity');
        this.player.equipment!.tool = command.item;
        state.salvage = null;
        break;
      }
      case 'research': {
        const technology = OPENING_TECHNOLOGIES.find((entry) => entry.id === command.technology);
        if (
          command.technology &&
          (!technology ||
            !technology.requires.every((id) => this.context.resources.research[id]?.unlocked) ||
            this.context.resources.research[command.technology]?.unlocked)
        )
          return this.result('locked');
        if (
          technology &&
          !technology.eligibility.every((cost) => this.history(cost.item) >= cost.quantity)
        )
          return this.result('missing-input');
        state.fieldTechnology = command.technology;
        state.fieldEnabled = command.enabled;
        if (technology)
          this.context.resources.research[technology.id] ??= {
            consumed: {},
            work: 0,
            unlocked: false,
          };
        break;
      }
      case 'handcraft-ui':
        state.handcraftVisible = command.visible;
        state.handcraftSuspended = !!command.suspended;
        if (!command.visible) this.cancelHandcraft();
        break;
      case 'craft': {
        const recipe = recipeById(command.recipe);
        if (!recipe || !this.validBatch(recipe, command.quantity))
          return this.result('invalid-request');
        if (!this.unlocked(recipe)) return this.result('locked');
        if (!state.handcraftVisible || state.handcraftSuspended || state.handcraft)
          return this.result('busy');
        if (recipe.id === 'base-minifab' && mini.owned) return this.result('busy');
        if (
          !planTransaction(
            this.bag,
            recipe.inputs,
            handcraftBagOutput(recipe, this.player.equipment!.tool),
            OPENING_CONTENT,
          )
        )
          return this.result(
            recipe.inputs.every((item) => available(this.bag, item.item) >= item.quantity)
              ? 'capacity'
              : 'missing-input',
          );
        this.beginHandcraft(recipe, command.quantity);
        break;
      }
      case 'minifab': {
        if (!mini.owned) return this.result('locked');
        if (!command.recipe) {
          mini.request = null;
          mini.job = null;
          this.returnBuffers();
          this.setMiniStatus(
            mini.input.length || mini.output.length ? 'cancelled-retained' : 'idle',
          );
          break;
        }
        const recipe = recipeById(command.recipe);
        if (!recipe?.minifab || !this.validBatch(recipe, command.quantity))
          return this.result('invalid-request');
        if (!this.unlocked(recipe) || !this.validChain(recipe)) return this.result('locked');
        if (mini.request || mini.job) return this.result('busy');
        if (
          (mini.input.length && signature(mini.input) !== signature(recipe.inputs)) ||
          (mini.output.length &&
            (mini.outputRecipe !== recipe.id || !this.outputFits(recipe, mini.output)))
        )
          return this.result('capacity');
        mini.request = { recipe: recipe.id, left: command.quantity };
        this.setMiniStatus('requested');
        break;
      }
      case 'wind': {
        if (!mini.owned) return this.result('locked');
        if (!Number.isFinite(command.degrees) || Math.abs(command.degrees) > 120)
          return this.result('invalid-request');
        const accepted = Math.min(Math.abs(command.degrees), mini.windBudget);
        mini.windBudget -= accepted;
        mini.charge = Math.min(
          chargeCapacity(mini.capacityLevel),
          mini.charge +
            (chargeCapacity(mini.capacityLevel) * accepted) / (360 * turnsToFull(mini.gearing)),
        );
        break;
      }
      case 'dismantle': {
        if (state.handcraft) return this.result('busy');
        if (command.item === 'minifab') {
          if (!mini.owned) return this.result('invalid-request');
          // Preflight before cancelling work or touching either buffer.
          if (
            !transact(
              this.bag,
              [],
              [{ item: 'scrap', quantity: 14 }, ...mini.input, ...mini.output],
              OPENING_CONTENT,
            )
          )
            return this.result('capacity');
          state.minifab = newOpening().minifab;
        } else {
          const item = OPENING_CONTENT.items[command.item];
          if (!item || command.item === 'scrap') return this.result('invalid-request');
          const equipped = this.player.equipment!.tool === command.item;
          if (
            !transact(
              this.bag,
              equipped ? [] : [{ item: command.item, quantity: 1 }],
              [{ item: 'scrap', quantity: item.solidValue }],
              OPENING_CONTENT,
            )
          )
            return this.result('capacity');
          if (equipped) this.player.equipment!.tool = null;
        }
        this.events.push({ kind: 'materials-recovered', item: command.item });
        break;
      }
    }
    this.context.mark(this.player, true);
    return this.result();
  }

  private validBatch(recipe: OpeningRecipe, count: number): boolean {
    const limit = recipe.outputs[0] ? OPENING_CONTENT.items[recipe.outputs[0].item].stackLimit : 1;
    return Number.isSafeInteger(count) && count > 0 && count <= limit;
  }

  private validChain(recipe: OpeningRecipe, visiting = new Set<string>()): boolean {
    if (visiting.has(recipe.id) || !this.unlocked(recipe)) return false;
    const next = new Set(visiting).add(recipe.id);
    return recipe.inputs.every((input) => {
      const precursor = OPENING_RECIPES.find(
        (entry) => entry.minifab && entry.outputs.some((output) => output.item === input.item),
      );
      return !precursor || this.validChain(precursor, next);
    });
  }

  private history(item: string): number {
    return (
      (item === 'scrap'
        ? this.context.resources.extractionTotals
        : this.context.resources.productionTotals)[item] ?? 0
    );
  }

  private fitting(item: string, count: number): number {
    const limit = OPENING_CONTENT.items[item].stackLimit;
    return Math.min(
      count,
      this.bag.slots.reduce(
        (space, slot) =>
          space + (slot === null ? limit : slot.item === item ? limit - slot.quantity : 0),
        0,
      ),
    );
  }

  private salvageDuration(): number {
    return this.player.equipment!.tool === 'prybar'
      ? settings.prybarSalvageSeconds
      : settings.handSalvageSeconds;
  }

  private beginHandcraft(recipe: OpeningRecipe, unitsLeft: number): void {
    transact(this.bag, recipe.inputs, [], OPENING_CONTENT);
    this.state.salvage = null;
    this.state.handcraft = {
      id: this.id(),
      recipe: recipe.id,
      remaining: recipe.seconds,
      inputs: copy(recipe.inputs),
      unitsLeft,
    };
  }

  private cancelHandcraft(): void {
    const job = this.state.handcraft;
    if (!job) return;
    if (!transact(this.bag, [], job.inputs, OPENING_CONTENT))
      throw new Error('Handcraft refund capacity invariant violated');
    this.state.handcraft = null;
    this.events.push({ kind: 'handcraft-ended', recipe: job.recipe, reason: 'cancelled' });
  }

  private record(recipe: OpeningRecipe): void {
    for (const output of recipe.outputs)
      this.context.resources.productionTotals[output.item] =
        (this.context.resources.productionTotals[output.item] ?? 0) + output.quantity;
    if (recipe.id === 'base-minifab')
      this.context.resources.productionTotals['minifab'] =
        (this.context.resources.productionTotals['minifab'] ?? 0) + 1;
  }

  private handcraft(delta: number): void {
    const job = this.state.handcraft;
    if (!job || this.state.handcraftSuspended) return;
    if (!this.state.handcraftVisible) {
      this.cancelHandcraft();
      return;
    }
    job.remaining = Math.max(0, job.remaining - delta);
    if (job.remaining > 1e-9) return;
    const recipe = recipeById(job.recipe)!;
    const bagOutput = handcraftBagOutput(recipe, this.player.equipment!.tool);
    const equipFirst = recipe.outputs.length > 0 && bagOutput.length === 0;
    if (!transact(this.bag, [], bagOutput, OPENING_CONTENT))
      throw new Error('Handcraft output capacity invariant violated');
    if (equipFirst) this.player.equipment!.tool = 'prybar';
    if (recipe.id === 'base-minifab') {
      this.state.minifab.owned = true;
      this.setMiniStatus('idle');
    }
    this.record(recipe);
    this.state.handcraft = null;
    const left = job.unitsLeft - 1;
    if (
      left &&
      planTransaction(
        this.bag,
        recipe.inputs,
        handcraftBagOutput(recipe, this.player.equipment!.tool),
        OPENING_CONTENT,
      )
    )
      this.beginHandcraft(recipe, left);
    else
      this.events.push({
        kind: 'handcraft-ended',
        recipe: recipe.id,
        reason: left ? 'stock-or-space' : 'completed',
      });
  }

  private salvage(delta: number): void {
    const task = this.state.salvage;
    if (!task) return;
    const target = this.context.get(task.target);
    if (
      !target?.deposit?.quantity ||
      !target.transform ||
      distance(target.transform.position, this.player.transform!.position) > settings.reach ||
      this.state.handcraft
    ) {
      this.state.salvage = null;
      this.events.push({ kind: 'salvage-attention', reason: 'range-or-depleted' });
      return;
    }
    task.remaining -= delta;
    if (task.remaining > 1e-9) return;
    const count = this.fitting('scrap', 1);
    if (count) transact(this.bag, [], [{ item: 'scrap', quantity: 1 }], OPENING_CONTENT);
    else {
      const position = this.player.transform!.position;
      const pile = Array.from(this.context.piles).find(
        (entity) =>
          entity.pile?.item === 'scrap' &&
          entity.transform &&
          distance(position, entity.transform.position) <= settings.groundMergeRadius,
      );
      if (pile?.pile) {
        pile.pile.quantity++;
        this.context.mark(pile);
      } else
        this.context.add({
          id: this.id(),
          kind: 'pile',
          pile: { item: 'scrap', quantity: 1 },
          transform: { position: { ...position }, facing: 0, moving: false, sprinting: false },
        });
      this.events.push({ kind: 'salvage-attention', reason: 'bag-full' });
    }
    target.deposit.quantity--;
    this.context.resources.extractionTotals['scrap'] =
      (this.context.resources.extractionTotals['scrap'] ?? 0) + 1;
    this.context.mark(target);
    task.remaining = this.salvageDuration();
    if (!target.deposit.quantity) {
      this.state.salvage = null;
      this.collisionChanged = true;
    }
  }

  private returnBuffers(): void {
    const mini = this.state.minifab;
    if (
      this.state.handcraft ||
      !transact(this.bag, [], [...mini.input, ...mini.output], OPENING_CONTENT)
    )
      return;
    mini.input = [];
    mini.output = [];
    mini.outputRecipe = null;
  }

  private outputFits(recipe: OpeningRecipe, existing: readonly ItemStack[]): boolean {
    return (
      existing.every((item) => recipe.outputs.some((output) => output.item === item.item)) &&
      recipe.outputs.every(
        (output) =>
          output.quantity +
            existing
              .filter((item) => item.item === output.item)
              .reduce((sum, item) => sum + item.quantity, 0) <=
          output.quantity,
      )
    );
  }

  private nextRecipe(recipe: OpeningRecipe, visiting = new Set<string>()): OpeningRecipe | null {
    if (visiting.has(recipe.id)) return null;
    const mini = this.state.minifab;
    const next = new Set(visiting).add(recipe.id);
    for (const input of recipe.inputs) {
      const buffered = [...mini.input, ...mini.output]
        .filter((item) => item.item === input.item)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (available(this.bag, input.item) + buffered >= input.quantity) continue;
      const precursor = OPENING_RECIPES.find(
        (entry) => entry.minifab && entry.outputs.some((output) => output.item === input.item),
      );
      return precursor && this.unlocked(precursor) ? this.nextRecipe(precursor, next) : null;
    }
    return recipe;
  }

  private supplyMini(): boolean {
    const mini = this.state.minifab;
    if (!mini.request) return false;
    const recipe = this.nextRecipe(recipeById(mini.request.recipe)!);
    if (!recipe) {
      this.setMiniStatus('ingredients');
      return false;
    }
    if (mini.input.length && signature(mini.input) !== signature(recipe.inputs)) {
      this.setMiniStatus('retained-inputs');
      return false;
    }
    const fromInput: ItemStack[] = [],
      fromOutput: ItemStack[] = [],
      fromBag: ItemStack[] = [];
    for (const input of recipe.inputs) {
      let left = input.quantity;
      const held = Math.min(
        left,
        mini.input
          .filter((entry) => entry.item === input.item)
          .reduce((sum, entry) => sum + entry.quantity, 0),
      );
      left -= held;
      if (held) fromInput.push({ item: input.item, quantity: held });
      const direct = Math.min(
        left,
        mini.output
          .filter((entry) => entry.item === input.item)
          .reduce((sum, entry) => sum + entry.quantity, 0),
      );
      left -= direct;
      if (direct) fromOutput.push({ item: input.item, quantity: direct });
      if (left) fromBag.push({ item: input.item, quantity: left });
    }
    if (this.state.handcraft && fromBag.length) {
      this.setMiniStatus('handcraft');
      return false;
    }
    const remainingOutput = take(mini.output, fromOutput);
    let nextSlots = planTransaction(this.bag, fromBag, [], OPENING_CONTENT);
    if (!nextSlots) {
      this.setMiniStatus('ingredients');
      return false;
    }
    let delivered = false;
    if (
      remainingOutput.length &&
      (mini.outputRecipe !== recipe.id || !this.outputFits(recipe, remainingOutput))
    ) {
      const afterDelivery =
        !this.state.handcraft &&
        planTransaction({ slots: nextSlots }, [], remainingOutput, OPENING_CONTENT);
      if (!afterDelivery) {
        this.setMiniStatus('output-full');
        return false;
      }
      nextSlots = afterDelivery;
      delivered = true;
    }
    this.bag.slots = nextSlots;
    mini.output = delivered ? [] : remainingOutput;
    if (!mini.output.length) mini.outputRecipe = null;
    const residue = take(mini.input, fromInput);
    mini.input = [...residue, ...copy(recipe.inputs)];
    mini.job = { id: this.id(), recipe: recipe.id, remaining: recipe.seconds };
    this.setMiniStatus('making');
    return true;
  }

  private minifab(delta: number): void {
    const mini = this.state.minifab;
    if (!mini.owned) return;

    // Completed output delivery is transfer only. Next intake may genuinely free a bag slot.
    const deliver = () => {
      if (
        mini.output.length &&
        !this.state.handcraft &&
        transact(this.bag, [], mini.output, OPENING_CONTENT)
      ) {
        mini.output = [];
        mini.outputRecipe = null;
      }
    };

    deliver();
    if (!mini.request && !mini.job) {
      this.returnBuffers();
      return;
    }
    let remaining = delta;
    for (let bounded = 0; bounded < 16 && remaining > 1e-10; bounded++) {
      if (!mini.job && !this.supplyMini()) break;
      deliver();
      const job = mini.job!,
        recipe = recipeById(job.recipe)!;
      const charged = mini.charge > 1e-10;
      const speed = charged ? 2 : 1;
      const interval = Math.min(remaining, job.remaining / speed, charged ? mini.charge : Infinity);
      job.remaining = Math.max(0, job.remaining - interval * speed);
      if (charged) mini.charge = Math.max(0, mini.charge - interval);
      remaining -= interval;
      if (job.remaining > 1e-9) continue;
      mini.input = take(mini.input, recipe.inputs);
      mini.output.push(...copy(recipe.outputs));
      mini.outputRecipe = recipe.id;
      this.record(recipe);
      mini.job = null;
      if (mini.request?.recipe === recipe.id && --mini.request.left === 0) {
        mini.request = null;
        this.setMiniStatus('completed');
      }
      deliver();
      if (!mini.request) break;
    }
  }

  private research(delta: number): void {
    const state = this.state;
    if (!state.fieldEnabled || !state.fieldTechnology) return;
    const technology = OPENING_TECHNOLOGIES.find((entry) => entry.id === state.fieldTechnology)!;
    const ledger = this.context.resources.research[technology.id];
    if (!ledger || ledger.unlocked) return;
    const cycles = Math.max(...technology.costs.map((cost) => cost.quantity));
    const interval = technology.seconds / cycles;
    const paid = Math.max(0, ...Object.values(ledger.consumed));
    const bundle = technology.costs
      .filter((cost) => (ledger.consumed[cost.item] ?? 0) < cost.quantity)
      .map((cost) => ({ item: cost.item, quantity: 1 }));
    if (!bundle.length || !bundle.every((cost) => available(this.bag, cost.item) >= cost.quantity))
      return;
    ledger.work = Math.min(technology.seconds, ledger.work + delta);
    if (ledger.work + 1e-9 < (paid + 1) * interval) return;
    if (!transact(this.bag, bundle, [], OPENING_CONTENT)) return;
    for (const cost of bundle) ledger.consumed[cost.item] = (ledger.consumed[cost.item] ?? 0) + 1;
    if (technology.costs.every((cost) => (ledger.consumed[cost.item] ?? 0) >= cost.quantity)) {
      ledger.work = technology.seconds;
      ledger.unlocked = true;
      this.events.push({ kind: 'research-completed', technology: technology.id });
      state.fieldTechnology = null;
    }
  }

  public step(delta: number): void {
    this.collisionChanged = false;
    this.state.minifab.windBudget = Math.min(
      180,
      this.state.minifab.windBudget + settings.maxDegreesPerSecond * delta,
    );
    if (this.player.transform!.moving) this.state.moved = true;
    this.handcraft(delta);
    this.salvage(delta);
    this.minifab(delta);
    this.research(delta);
    this.context.mark(this.player, true);
  }

  public view(): OpeningView {
    return structuredClone({
      state: this.state,
      bag: this.bag,
      tool: this.player.equipment!.tool,
      ledgers: this.context.resources.research,
      extracted: this.context.resources.extractionTotals,
    });
  }
}
