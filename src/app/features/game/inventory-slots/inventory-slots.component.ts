import { Component, input } from '@angular/core';
import { ITEM_NAMES } from '@content/opening';
import type { ItemStack } from '@contracts/simulation';

@Component({
  selector: 'app-inventory-slots',
  templateUrl: './inventory-slots.component.html',
  styleUrl: './inventory-slots.component.scss',
})
export class InventorySlotsComponent {
  public readonly slots = input.required<readonly (Readonly<ItemStack> | null)[]>();
  public readonly label = input.required<string>();

  public name(item: string): string {
    return ITEM_NAMES[item] ?? item;
  }
}
