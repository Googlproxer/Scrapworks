import { afterRenderEffect, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ITEM_NAMES,
  OPENING_RECIPES,
  OPENING_TECHNOLOGIES,
  chargeCapacity,
} from '../../../../content/opening';
import type { OpeningRecipe, OpeningTechnology } from '../../../../content/opening';
import type { ItemStack } from '@contracts/simulation';
import { GameRuntimeService } from '../game-runtime.service';
import { WindingHandleComponent } from '../winding-handle/winding-handle.component';

@Component({
  imports: [WindingHandleComponent, CdkTrapFocus],
  selector: 'app-field-kit',
  styleUrl: './field-kit.component.scss',
  templateUrl: './field-kit.component.html',
})
export class FieldKitComponent {
  public readonly runtime = inject(GameRuntimeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly opening = computed(() => this.runtime.world()?.opening);
  public readonly recipes = OPENING_RECIPES;
  public readonly technologies = OPENING_TECHNOLOGIES;
  public readonly recipeId = signal('scrap-prybar');
  public readonly miniRecipeId = signal('metal-plate');
  public readonly miniBatch = signal(1);
  public readonly miniRecipe = computed(() =>
    this.recipes.find((recipe) => recipe.id === this.miniRecipeId())!,
  );
  public readonly batch = signal(1);
  public readonly recipeResult = computed(() =>
    this.recipe().id === 'base-minifab'
      ? 'Personal Mini Fabricator'
      : this.materials(this.recipe().outputs),
  );
  public readonly cancelHandcraft = () =>
    this.runtime.command({ type: 'handcraft-ui', visible: false });
  public readonly recipe = computed(() =>
    this.recipes.find((recipe) => recipe.id === this.recipeId())!,
  );
  public readonly capacity = computed(() =>
    chargeCapacity(this.opening()?.state.minifab.capacityLevel ?? 0),
  );
  public readonly usedSlots = computed(() => this.opening()?.bag.slots.filter(Boolean).length ?? 0);
  public readonly guidance = computed(() => {
    const opening = this.opening();
    if (!opening) return '';
    if (!opening.state.moved)
      return 'Move with your movement controls. Approach the scrap deposit; salvage works within two metres.';
    if (!opening.ledgers['improvised-tools']?.unlocked)
      return 'Collect four scrap, then start Improvised tools research. Gather more while research runs.';
    if (!opening.tool)
      return 'Handcraft a scrap prybar. Your first prybar equips automatically and triples salvage speed.';
    if (!opening.ledgers['material-recovery']?.unlocked)
      return 'Research Material recovery to handcraft plates and wire.';
    if (
      !opening.ledgers['mechanical-assembly']?.unlocked ||
      !opening.ledgers['electrical-assembly']?.unlocked
    )
      return 'Research Mechanical and Electrical assembly. Handcraft their parts from plates and wire.';
    if (!opening.ledgers['mini-fabrication']?.unlocked)
      return 'Research Mini fabrication with one mechanical and one electrical part; construction needs its own materials.';
    if (!opening.state.minifab.owned)
      return 'Hand-assemble your Mini Fabricator from plates, wire and both kinds of parts.';
    if (!this.runtime.world()?.productionTotals['plate'] || !opening.state.minifab.owned)
      return 'Request a MiniFab recipe. It makes compatible precursors and works while you explore.';
    return 'Your MiniFab works without power. Request a recipe and keep gathering; winding gives an optional local speed boost.';
  });

  public constructor() {
    afterRenderEffect(() => {
      if (this.runtime.workExitWarning())
        this.element.nativeElement.querySelector<HTMLButtonElement>('[data-stay]')?.focus();
      else if (this.runtime.fieldKitOpen())
        this.element.nativeElement.querySelector<HTMLElement>('[data-kit-heading]')?.focus();
    });
  }

  public readonly activeTab = signal<'inventory' | 'research'>('inventory');

  public selectTab(tab: 'inventory' | 'research'): void {
    if (tab === this.activeTab()) return;
    this.runtime.requestWorkExit(() => {
      this.runtime.command({ type: 'handcraft-ui', visible: false });
      this.activeTab.set(tab);
      this.element.nativeElement
        .querySelector<HTMLButtonElement>(tab === 'research' ? '#research-tab' : '#inventory-tab')
        ?.focus();
    });
  }

  public tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tab =
      event.key === 'Home'
        ? 'inventory'
        : event.key === 'End'
          ? 'research'
          : this.activeTab() === 'inventory'
            ? 'research'
            : 'inventory';
    this.selectTab(tab);
  }

  public name(item: string): string {
    return ITEM_NAMES[item] ?? item;
  }

  public recipeName(id: string): string {
    return this.recipes.find((recipe) => recipe.id === id)?.name ?? id;
  }

  public chooseMiniRecipe(event: Event): void {
    this.miniRecipeId.set((event.target as HTMLSelectElement).value);
    this.miniBatch.set(1);
  }

  public chooseMiniBatch(event: Event): void {
    this.miniBatch.set(Number((event.target as HTMLSelectElement).value));
  }

  public materials(items: readonly ItemStack[]): string {
    return items.map((item) => `${item.quantity} ${this.name(item.item)}`).join(', ') || 'Empty';
  }

  public amount(item: string): number {
    return this.runtime.world()?.inventory[item] ?? 0;
  }

  public seconds(value: number): string {
    return Math.max(0, value).toFixed(1);
  }

  public recipeUnlocked(recipe: OpeningRecipe): boolean {
    return !!this.opening()?.ledgers[recipe.technology]?.unlocked;
  }

  public technologyReady(technology: OpeningTechnology): boolean {
    const opening = this.opening();
    return (
      !!opening &&
      technology.requires.every((id) => opening.ledgers[id]?.unlocked) &&
      technology.eligibility.every(
        (cost) =>
          (cost.item === 'scrap'
            ? (opening.extracted[cost.item] ?? 0)
            : (this.runtime.world()?.productionTotals[cost.item] ?? 0)) >= cost.quantity,
      )
    );
  }

  public researchStatus(technology: OpeningTechnology): string {
    const opening = this.opening(),
      ledger = opening?.ledgers[technology.id];
    if (ledger?.unlocked) return 'Complete';
    if (!this.technologyReady(technology))
      return 'Needs prerequisites and cumulative collection / production';
    if (opening?.state.fieldTechnology !== technology.id)
      return ledger?.work ? 'Progress retained' : 'Available';
    if (!opening.state.fieldEnabled) return 'Paused; no bag withdrawals';
    const waiting = technology.costs.some(
      (cost) => (ledger?.consumed[cost.item] ?? 0) < cost.quantity && this.amount(cost.item) === 0,
    );
    return waiting
      ? 'Waiting for a complete material bundle'
      : 'Researching from uncommitted bag stock';
  }

  public chooseRecipe(event: Event): void {
    this.recipeId.set((event.target as HTMLSelectElement).value);
    this.batch.set(1);
  }

  public chooseBatch(event: Event): void {
    this.batch.set(Number((event.target as HTMLSelectElement).value));
  }

  public craft(): void {
    this.runtime.command({ type: 'handcraft-ui', visible: true });
    this.runtime.command({ type: 'craft', recipe: this.recipeId(), quantity: this.batch() });
  }

  public handcraftProgress(): number {
    const job = this.opening()?.state.handcraft;
    return job
      ? 1 - job.remaining / (this.recipes.find((recipe) => recipe.id === job.recipe)?.seconds ?? 1)
      : 0;
  }
}
