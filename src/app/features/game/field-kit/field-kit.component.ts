import { afterRenderEffect, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';

import { GameRuntimeService } from '../game-runtime.service';
import { InventoryPanelComponent } from './inventory-panel.component';
import { HandcraftPanelComponent } from './handcraft-panel.component';
import { MiniFabPanelComponent } from './minifab-panel.component';
import { ResearchPanelComponent } from './research-panel.component';

@Component({
  imports: [
    InventoryPanelComponent,
    HandcraftPanelComponent,
    MiniFabPanelComponent,
    ResearchPanelComponent,
    CdkTrapFocus,
  ],
  selector: 'app-field-kit',
  styleUrl: './field-kit.component.scss',
  templateUrl: './field-kit.component.html',
})
export class FieldKitComponent {
  public readonly runtime = inject(GameRuntimeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly opening = computed(() => this.runtime.world()?.opening);

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

  public seconds(value: number): string {
    return Math.max(0, value).toFixed(1);
  }
}
