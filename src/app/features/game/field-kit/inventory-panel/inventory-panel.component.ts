import { Component } from '@angular/core';
import { OpeningPanel } from '../opening-panel';
import { EquipablePanelComponent } from '../equipable-panel/equipable-panel.component';
import { InventorySlotsComponent } from '../../inventory-slots/inventory-slots.component';

@Component({
  selector: 'app-inventory-panel',
  imports: [EquipablePanelComponent, InventorySlotsComponent],
  templateUrl: './inventory-panel.component.html',
  styleUrl: '../field-kit.component.scss',
  host: { role: 'region', 'aria-labelledby': 'bag-title' },
})
export class InventoryPanelComponent extends OpeningPanel {}
