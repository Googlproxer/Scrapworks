import { Component, computed, ElementRef, inject } from '@angular/core';
import { GameRuntimeService } from '../game-runtime.service';
import { ITEM_NAMES } from '@content/opening';
import { TOOLBAR_SLOTS } from '@contracts/toolbar';
import type { EquipmentId } from '@contracts/factory';

import { ItemSprite } from '@app/shared/item-sprite/item-sprite';

@Component({
  imports: [ItemSprite],
  selector: 'app-placeable-toolbar',
  templateUrl: './placeable-toolbar.component.html',
  styleUrl: './placeable-toolbar.component.scss',
})
export class PlaceableToolbarComponent {
  public readonly runtime = inject(GameRuntimeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly names = ITEM_NAMES;
  public readonly slots = computed(() =>
    Array.from({ length: TOOLBAR_SLOTS }, (_, index) => ({
      index,
      item: this.runtime.toolbar()?.slots[index] ?? null,
    })),
  );
  public readonly shortNames: Readonly<Record<EquipmentId, string>> = {
    'power-connection': 'Power',
    'solar-panel': 'Solar',
    'wind-turbine': 'Wind',
    recycler: 'Recycle',
    'basic-fabricator': 'Basic',
    'medium-fabricator': 'Medium',
    extractor: 'Extract',
    laboratory: 'Lab',
    conveyor: 'Belt',
    sorter: 'Sorter',
    'water-pump': 'Pump',
    pipe: 'Pipe',
    'pipe-junction': 'Junction',
    'water-treatment': 'Filter',
    'water-tank': 'Tank',
    'water-return': 'Return',
    greenhouse: 'Plants',
    battery: 'Battery',
    'coal-generator': 'Coal',
    'air-scrubber': 'Air',
  };
  public readonly active = computed(() => this.runtime.toolbar()?.active ?? 0);

  public amount(item: string): number {
    return this.runtime.world()?.inventory[item] ?? 0;
  }

  public key(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focused = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    const current = focused ? Number(focused.dataset['slot']) : this.active();
    const slot =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TOOLBAR_SLOTS - 1
          : (current + (event.key === 'ArrowRight' ? 1 : TOOLBAR_SLOTS - 1)) % TOOLBAR_SLOTS;
    this.runtime.selectPlaceable(slot, false);
    this.element.nativeElement.querySelector<HTMLElement>(`[data-slot="${slot}"]`)?.focus();
  }
}
