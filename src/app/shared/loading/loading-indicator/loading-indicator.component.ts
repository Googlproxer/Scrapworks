import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-loading-indicator',
  templateUrl: './loading-indicator.component.html',
})
export class LoadingIndicatorComponent {
  public readonly task = input('Loading…');
  public readonly progress = input<number | null>(null);
  public readonly percentage = computed(() => {
    const value = this.progress();
    return value !== null && Number.isFinite(value)
      ? Math.round(Math.max(0, Math.min(1, value)) * 100)
      : null;
  });
}
