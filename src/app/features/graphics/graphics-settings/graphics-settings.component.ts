import { DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import {
  defaultGraphicsSettings,
  graphicsPresets,
  type GraphicsPreset,
  type GraphicsSettings,
} from '@contracts/graphics';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { GraphicsSettingsService } from '../graphics-settings.service';

function model(settings: GraphicsSettings) {
  return {
    preset: settings.preset,
    shadows: settings.shadows,
    renderScale: String(settings.renderScale),
  };
}

@Component({
  imports: [FormField],
  selector: 'app-graphics-settings',
  styleUrl: './graphics-settings.component.scss',
  templateUrl: './graphics-settings.component.html',
})
export class GraphicsSettingsComponent {
  public readonly settings = inject(GraphicsSettingsService);
  public readonly runtime = inject(GameRuntimeService);
  private readonly ref = inject(DialogRef);
  private readonly lifetime = inject(DestroyRef);
  public readonly draft = signal(model(this.settings.settings()));
  public readonly fields = form(this.draft);
  public readonly loaded = signal(false);
  public readonly saving = signal(false);
  public readonly applied = signal(false);

  public constructor() {
    void this.settings.ready.then(() => {
      if (!this.lifetime.destroyed) {
        this.draft.set(model(this.settings.settings()));
        this.loaded.set(true);
      }
    });
  }

  public selectPreset(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as GraphicsPreset;
    if (value === 'custom') this.customise();
    else if (value === 'low' || value === 'medium' || value === 'high')
      this.draft.set(model(graphicsPresets[value]));
    this.applied.set(false);
  }

  public customise(): void {
    this.draft.update((value) => ({ ...value, preset: 'custom' }));
    this.applied.set(false);
  }

  public reset(): void {
    this.draft.set(model(defaultGraphicsSettings));
    this.applied.set(false);
  }

  public async apply(): Promise<void> {
    if (!this.loaded() || this.saving()) return;
    this.saving.set(true);
    this.applied.set(false);
    const draft = this.draft();
    try {
      const saved = await this.settings.save({
        ...draft,
        version: 1,
        renderScale: Number(draft.renderScale),
      });
      if (!this.lifetime.destroyed) this.applied.set(saved);
    } finally {
      if (!this.lifetime.destroyed) this.saving.set(false);
    }
  }

  public close(): void {
    this.ref.close();
  }
}
