import { Component, computed } from '@angular/core';
import { FACTORY_SETTINGS } from '@content/factory';
import { OpeningPanel } from '../opening-panel';
import { EnvironmentPanelComponent } from '../environment-panel/environment-panel.component';

import { ItemSprite } from '@app/shared/item-sprite/item-sprite';

@Component({
  selector: 'app-factory-panel',
  imports: [ItemSprite, EnvironmentPanelComponent],
  templateUrl: './factory-panel.component.html',
  styleUrl: './factory-panel.component.scss',
})
export class FactoryPanelComponent extends OpeningPanel {
  public readonly world = this.runtime.world;
  public readonly settings = FACTORY_SETTINGS;
  public readonly counts = computed(() => {
    const counts = new Map<string, number>();
    for (const building of this.world()?.buildings ?? []) {
      if (building.buildingId !== 'test-building')
        counts.set(building.buildingId, (counts.get(building.buildingId) ?? 0) + 1);
    }
    return [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, quantity]) => ({ kind, quantity }));
  });
}
