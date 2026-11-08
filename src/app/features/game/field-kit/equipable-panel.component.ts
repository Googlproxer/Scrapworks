import { Component, computed, linkedSignal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { EQUIPMENT_BLUEPRINTS } from '@content/first-factory';
import { isPlaceable } from '@content/factory';
import { TOOLBAR_SLOTS } from '@contracts/toolbar';
import { OpeningPanel } from './opening-panel';

@Component({
  selector: 'app-equipable-panel',
  imports: [FormField],
  templateUrl: './equipable-panel.component.html',
  styleUrl: './equipable-panel.component.scss',
})
export class EquipablePanelComponent extends OpeningPanel {
  public readonly slots = Array.from({ length: TOOLBAR_SLOTS }, (_, i) => i);
  private readonly activeSlot = computed(() => this.opening()?.state.toolbar?.active ?? 0);
  public readonly model = linkedSignal(() => ({ slot: String(this.activeSlot()) }));
  public readonly fields = form(this.model);
  public readonly placeables = computed(() =>
    EQUIPMENT_BLUEPRINTS.filter(
      (b) =>
        isPlaceable(b.id) &&
        (this.amount(b.id) > 0 || this.opening()?.state.toolbar?.slots.includes(b.id)),
    ),
  );

  public assign(item: string | null): void {
    if (item === null || isPlaceable(item))
      this.runtime.assignPlaceable(Number(this.model().slot), item);
  }
}
