import { Component, computed, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ITEM_NAMES } from '@content/opening';

@Component({
  imports: [NgOptimizedImage],
  selector: 'app-item-sprite',
  styleUrl: './item-sprite.scss',
  templateUrl: './item-sprite.html',
  host: { '[style.inline-size.px]': 'size()' },
})
export class ItemSprite {
  public readonly item = input.required<string>();
  public readonly size = input(40);
  public readonly alt = input('');
  public readonly source = computed(() => {
    const id = this.item() === 'minifab' ? 'mini-fabricator' : this.item();
    return Object.hasOwn(ITEM_NAMES, id) ||
      ['mini-fabricator', 'water-clean', 'water-untreated'].includes(id)
      ? 'assets/ui/items/' + id + '.png'
      : null;
  });
}
