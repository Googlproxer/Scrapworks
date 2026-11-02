import { Component } from '@angular/core';
import { OpeningPanel } from './opening-panel';

@Component({
  selector: 'app-inventory-panel',
  imports: [],
  templateUrl: './inventory-panel.component.html',
  styleUrl: './field-kit.component.scss',
  host: { role: 'region', 'aria-labelledby': 'bag-title' },
})
export class InventoryPanelComponent extends OpeningPanel {}
