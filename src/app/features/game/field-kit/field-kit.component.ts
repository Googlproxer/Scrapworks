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
import { FIELD_MANUAL, GUIDE_STEPS, guideStep } from './opening-guide';
import { CdkTrapFocus } from '@angular/cdk/a11y';

import { GameRuntimeService } from '../game-runtime.service';
import { InventoryPanelComponent } from './inventory-panel/inventory-panel.component';
import { HandcraftPanelComponent } from './handcraft-panel/handcraft-panel.component';
import { MiniFabPanelComponent } from './minifab-panel/minifab-panel.component';
import { ResearchPanelComponent } from './research-panel/research-panel.component';
import { FactoryPanelComponent } from './factory-panel/factory-panel.component';
import { GameplaySaveService } from '../../save/gameplay-save.service';

@Component({
  imports: [
    InventoryPanelComponent,
    HandcraftPanelComponent,
    MiniFabPanelComponent,
    ResearchPanelComponent,
    FactoryPanelComponent,
    CdkTrapFocus,
  ],
  selector: 'app-field-kit',
  styleUrl: './field-kit.component.scss',
  templateUrl: './field-kit.component.html',
})
export class FieldKitComponent {
  public readonly saves = inject(GameplaySaveService, { optional: true });
  public readonly runtime = inject(GameRuntimeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly opening = computed(() => this.runtime.world()?.opening);

  public readonly usedSlots = computed(() => this.opening()?.bag.slots.filter(Boolean).length ?? 0);
  public readonly guide = computed(() => guideStep(this.runtime.world()));
  public readonly guidance = computed(() => this.guide()[2]);
  public readonly guideNumber = computed(() => GUIDE_STEPS.indexOf(this.guide()) + 1);
  public readonly guideCollapsed = signal(false);
  public readonly workArea = signal<'inventory' | 'craft' | 'minifab'>('inventory');
  public readonly manual = FIELD_MANUAL;

  public toggleGuide(): void {
    this.guideCollapsed.update((value) => !value);
  }

  public constructor() {
    effect(() => {
      this.runtime.restoreRevision?.();
      untracked(() => this.activeTab.set('inventory'));
    });
    afterRenderEffect(() => {
      if (this.runtime.workExitWarning())
        this.element.nativeElement.querySelector<HTMLButtonElement>('[data-stay]')?.focus();
      else if (this.runtime.fieldKitOpen() && (this.runtime.canFocusCrafting?.() ?? true))
        this.element.nativeElement.querySelector<HTMLElement>('[data-kit-heading]')?.focus();
    });
  }

  public readonly activeTab = signal<'inventory' | 'research' | 'factory' | 'guide'>('inventory');

  public selectTab(tab: 'inventory' | 'research' | 'factory' | 'guide'): void {
    if (tab === this.activeTab()) return;
    this.runtime.requestWorkExit(() => {
      this.runtime.command({ type: 'handcraft-ui', visible: false });
      this.activeTab.set(tab);
      this.element.nativeElement.querySelector<HTMLButtonElement>(`#${tab}-tab`)?.focus();
    });
  }

  public tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['inventory', 'research', 'factory', 'guide'] as const;
    const index = tabs.indexOf(this.activeTab());
    const tab =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs[tabs.length - 1]
          : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    this.selectTab(tab);
  }

  public seconds(value: number): string {
    return Math.max(0, value).toFixed(1);
  }
}
