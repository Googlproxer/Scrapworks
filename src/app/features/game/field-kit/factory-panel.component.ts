import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  effect,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, min, max } from '@angular/forms/signals';
import { canFabricate } from '@content/first-factory';
import { FACTORY_SETTINGS, MACHINES, RECYCLER_OUTCOMES, isMachineKind } from '@content/factory';
import { OPENING_CONTENT } from '@content/opening';
import { machineMaterials } from '@content/machine-materials';
import type { FactoryCommand } from '@contracts/factory';
import type { ItemStack } from '@contracts/simulation';
import { OpeningPanel } from './opening-panel';
import { TransportPanelComponent } from './transport-panel.component';
import { EnvironmentPanelComponent } from './environment-panel.component';
import { MACHINE_ADVICE, machineAdvice } from './machine-advice';

@Component({
  imports: [FormField, NgTemplateOutlet, TransportPanelComponent, EnvironmentPanelComponent],
  selector: 'app-factory-panel',
  styleUrl: './factory-panel.component.scss',
  templateUrl: './factory-panel.component.html',
})
export class FactoryPanelComponent extends OpeningPanel {
  public readonly adviceExamples = Object.values(MACHINE_ADVICE);
  public readonly nextAction = computed(() => machineAdvice(this.selected(), this.runtime.world()));
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  public constructor() {
    super();
    afterRenderEffect(() => {
      const id = this.selectedId();
      if (id && !this.machines().some((b) => b.id === id)) {
        this.runtime.inspectFactory('');
        this.element.nativeElement.querySelector<HTMLElement>('#machine-title')?.focus();
      }
    });
    effect(() => {
      const inputs = this.acceptedMaterials().input;
      untracked(() => {
        if (!inputs.includes(this.model().item))
          this.model.update((m) => ({ ...m, item: inputs[0] ?? '' }));
      });
    });
    effect(() => {
      const context = this.recipeContext();
      untracked(() => {
        if (this.model().recipe !== context.recipe)
          this.model.update((m) => ({ ...m, recipe: context.recipe }));
      });
    });
  }

  public readonly settings = FACTORY_SETTINGS;
  public readonly model = signal({
    recipe: '',
    item: 'scrap',
    count: 1,
  });
  public readonly fields = form(this.model, (path) => {
    min(path.count, 1);
    max(path.count, Number.MAX_SAFE_INTEGER);
  });
  public readonly world = this.runtime.world;
  public readonly machines = computed(
    () => this.world()?.buildings.filter((b) => b.buildingId !== 'test-building') ?? [],
  );
  public readonly selected = computed(() => {
    const detail = this.runtime.inspection();
    return detail?.id === this.runtime.selectedEntityId() &&
      (detail.entity.machine || detail.entity.transport)
      ? detail.entity
      : null;
  });
  public readonly selectedId = this.runtime.selectedEntityId;
  public readonly bagMaterials = computed(() => this.buffer(this.opening()?.bag.slots ?? []));
  public readonly hasOutput = computed(
    () => this.selected()?.machine?.output.slots.some((slot) => slot !== null) ?? false,
  );
  public readonly loadMaterials = computed(() => {
    const stock = new Map(this.bagMaterials().map((entry) => [entry.item, entry.quantity]));
    return this.acceptedMaterials().input.map((item) => ({ item, quantity: stock.get(item) ?? 0 }));
  });
  public readonly hasValidTransferQuantity = computed(() => {
    const requested = this.model().count;
    return Number.isSafeInteger(requested) && requested > 0;
  });
  public readonly canLoadInput = computed(() => {
    const requested = this.model().count;
    return (
      !!this.selected()?.machine?.input.slots.length &&
      this.hasValidTransferQuantity() &&
      this.acceptedMaterials().input.includes(this.model().item) &&
      this.stock(this.opening()?.bag.slots ?? [], this.model().item) >= requested
    );
  });
  private readonly machineKind = computed(() => this.selected()?.building?.buildingId);
  private readonly selectedRecipe = computed(() =>
    this.recipes.find((r) => r.id === this.selected()?.machine?.recipe),
  );
  private readonly recipeContext = computed(
    () => ({
      id: this.selected()?.id,
      recipe: this.selected()?.machine?.recipe ?? '',
    }),
    { equal: (a, b) => a.id === b.id && a.recipe === b.recipe },
  );
  public readonly acceptedMaterials = computed(() => {
    const kind = this.machineKind();
    return isMachineKind(kind)
      ? machineMaterials(kind, this.selectedRecipe()?.id ?? null)
      : { input: [], output: [] };
  });
  public readonly emptyWork = { remaining: 0, inputs: [], outputs: [] };
  /** Invisible alternatives reserve the actual wrapped height, including every recycler result. */
  public readonly workExamples = computed(() => {
    const kind = this.machineKind();
    if (kind === 'recycler')
      return RECYCLER_OUTCOMES.map((outputs) => ({
        remaining: this.settings.recyclerSeconds,
        inputs: [{ item: 'scrap', quantity: this.settings.recyclerInput }],
        outputs,
      }));
    if (kind === 'extractor')
      return [
        {
          remaining: this.settings.extractionSeconds,
          inputs: [],
          outputs: [
            {
              item:
                this.world()?.deposits.find((d) => d.id === this.selected()?.machine?.deposit)
                  ?.kind ?? 'scrap',
              quantity: this.settings.extractionQuantity,
            },
          ],
        },
      ];
    const recipe = this.selectedRecipe();
    return recipe
      ? [{ remaining: recipe.seconds, inputs: recipe.inputs, outputs: recipe.outputs }]
      : [];
  });
  /** Reserve all supported layouts invisibly; these are not the permitted loading choices. */
  public readonly bufferLayoutItems = computed(() => {
    const kind = this.machineKind();

    const unique = (items: readonly string[]) => [...new Set(items)].sort();

    if (kind === 'recycler')
      return {
        input: ['scrap'],
        output: unique(RECYCLER_OUTCOMES.flatMap((r) => r.map((s) => s.item))),
      };
    if (kind === 'extractor') return { input: [], output: ['scrap', 'coal'] };
    if (kind === 'coal-generator') return { input: ['coal'], output: [] };
    if (kind === 'laboratory')
      return {
        input: unique(this.technologies.flatMap((t) => t.costs.map((s) => s.item))),
        output: [],
      };
    const tier =
      kind === 'basic-fabricator' ? 'basic' : kind === 'medium-fabricator' ? 'medium' : null;
    const recipes = tier
      ? this.recipes.filter((r) =>
          canFabricate(
            r,
            tier,
            this.technologies.map((t) => t.id),
          ),
        )
      : [];
    return {
      input: unique(recipes.flatMap((r) => r.inputs.map((s) => s.item))),
      output: unique(recipes.flatMap((r) => r.outputs.map((s) => s.item))),
    };
  });
  public readonly bufferItems = computed(() => {
    const machine = this.selected()?.machine;

    const unique = (items: readonly string[]) => [...new Set(items)].sort();

    return {
      input: unique([
        ...this.acceptedMaterials().input,
        ...this.buffer(machine?.input.slots ?? []).map((s) => s.item),
      ]),
      output: unique([
        ...this.acceptedMaterials().output,
        ...this.buffer(machine?.output.slots ?? []).map((s) => s.item),
      ]),
    };
  });
  public readonly bufferExamples = computed(() => {
    const kind = this.machineKind(),
      definition = isMachineKind(kind) ? MACHINES[kind] : null;

    const maximum = (items: readonly string[], slots: number) =>
      items.map((item) => ({ item, quantity: slots * OPENING_CONTENT.items[item].stackLimit }));

    return {
      input: maximum(this.bufferLayoutItems().input, definition?.inputSlots ?? 0),
      output: maximum(this.bufferLayoutItems().output, definition?.outputSlots ?? 0),
    };
  });
  public readonly eligibleRecipes = computed(() => {
    const kind = this.selected()?.building?.buildingId;
    const tier =
      kind === 'basic-fabricator' ? 'basic' : kind === 'medium-fabricator' ? 'medium' : null;
    return tier
      ? this.recipes.filter((r) => canFabricate(r, tier, this.world()?.research ?? []))
      : [];
  });
  public readonly lastRequest = signal('');

  public send(command: FactoryCommand): void {
    this.runtime.requestWorkExit(() => {
      const submitted = this.runtime.command(command);
      this.lastRequest.set(
        submitted.status === 'queued'
          ? 'Request queued; completion or rejection appears in notifications.'
          : 'Factory controls are unavailable while the game is suspended.',
      );
    });
  }

  public buffer(slots: readonly (Readonly<ItemStack> | null)[]): readonly Readonly<ItemStack>[] {
    const counts = new Map<string, number>();
    for (const slot of slots)
      if (slot) counts.set(slot.item, (counts.get(slot.item) ?? 0) + slot.quantity);
    return [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([item, quantity]) => ({ item, quantity }));
  }

  public stock(slots: readonly (Readonly<ItemStack> | null)[], item: string): number {
    return slots.reduce((sum, slot) => sum + (slot?.item === item ? slot.quantity : 0), 0);
  }

  public configure(enabled: boolean, recipe: string | null): void {
    const target = this.selectedId();
    if (target) this.send({ type: 'factory-configure', target, enabled, recipe });
  }

  public transfer(
    buffer: 'input' | 'output',
    direction: 'load' | 'unload',
    item = this.model().item,
  ): void {
    if (!this.hasValidTransferQuantity()) return;
    const target = this.selectedId();
    if (target)
      this.send({
        type: 'factory-transfer',
        target,
        buffer,
        direction,
        item,
        quantity: this.model().count,
      });
  }
}
