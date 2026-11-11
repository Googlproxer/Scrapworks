import { Component, computed, signal } from '@angular/core';
import { ENVIRONMENT_SETTINGS } from '@content/environment';
import { OpeningPanel } from '../opening-panel';

@Component({
  selector: 'app-environment-panel',
  templateUrl: './environment-panel.component.html',
  styleUrl: './environment-panel.component.scss',
})
export class EnvironmentPanelComponent extends OpeningPanel {
  public readonly world = this.runtime.world;
  public readonly environment = computed(() => this.world()?.factory?.environment);
  public readonly healthOpen = signal(false);
  public readonly sourceRows = computed(() => {
    const env = this.environment();
    return (
      env?.sources.map((source) => ({
        ...source,
        quality: source.cells.reduce((n, cell) => n + env.health[cell], 0) / source.cells.length,
      })) ?? []
    );
  });
  public readonly healthRows = computed(() => {
    const env = this.environment();
    if (!env) return [];
    const water = new Set(env.sources.flatMap((source) => source.cells));
    return Array.from({ length: Math.ceil(env.health.length / env.columns) }, (_, row) =>
      env.health
        .slice(row * env.columns, (row + 1) * env.columns)
        .map((health, column) => ({ health, water: water.has(row * env.columns + column) })),
    );
  });
  public readonly healthColumns = computed(() =>
    Array.from({ length: this.environment()?.columns ?? 0 }, (_, index) => index + 1),
  );
  public readonly forecast = computed(() => {
    const weather = this.environment()?.weather,
      tick = this.world()?.tick ?? 0;
    if (!weather) return 'Weather unavailable';
    if (weather.kind !== 'clear')
      return `${weather.kind} · ${this.seconds((weather.endTick - tick) / 20)} s remaining`;
    return weather.nextTick - tick <= ENVIRONMENT_SETTINGS.forecastLeadTicks
      ? `${weather.nextKind} in ${this.seconds((weather.nextTick - tick) / 20)} s`
      : 'Clear · no event announced';
  });

  public toggleHealth(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) this.healthOpen.set(event.target.open);
  }
}
