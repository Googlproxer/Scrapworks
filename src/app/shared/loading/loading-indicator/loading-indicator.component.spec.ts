import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { loadingProgress } from '@contracts/loading';
import { LoadingIndicatorComponent } from './loading-indicator.component';

describe('LoadingIndicatorComponent', () => {
  it('exposes current-task progress without announcing percentage changes', async () => {
    const fixture = TestBed.createComponent(LoadingIndicatorComponent);
    fixture.componentRef.setInput('task', 'Loading character…');
    fixture.componentRef.setInput('progress', 0.42);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const progress = element.querySelector('[role="progressbar"]')!;
    expect(progress.getAttribute('aria-valuenow')).toBe('42');
    expect(progress.getAttribute('aria-label')).toBe('Loading character…');
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Loading character…');
    expect((await axe.run(element)).violations).toEqual([]);
    fixture.componentRef.setInput('progress', null);
    await fixture.whenStable();
    expect(progress.hasAttribute('aria-valuenow')).toBe(false);
    expect(progress.classList.contains('loading-indeterminate')).toBe(true);
  });

  it('rejects nonfinite totals, clamps values and keeps a task moving forwards', () => {
    expect(loadingProgress(null, Number.NaN)).toBeNull();
    expect(loadingProgress(0.4, Number.POSITIVE_INFINITY)).toBe(0.4);
    expect(loadingProgress(null, -1)).toBe(0);
    expect(loadingProgress(0.4, 0.2)).toBe(0.4);
    expect(loadingProgress(0.4, 2)).toBe(1);
  });
});
