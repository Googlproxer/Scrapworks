import { afterNextRender, inject, InjectionToken, Injector } from '@angular/core';
import {
  animationFrames,
  combineLatest,
  filter,
  fromEventPattern,
  of,
  skip,
  Subscription,
  take,
} from 'rxjs';

export type AfterPaint = (work: () => void) => () => void;

function firstContentfulPaint() {
  if (
    typeof PerformanceObserver === 'undefined' ||
    !PerformanceObserver.supportedEntryTypes?.includes('paint') ||
    performance.getEntriesByName('first-contentful-paint').length
  )
    return of(undefined);
  return fromEventPattern<PerformanceObserverEntryList>(
    (handler) => {
      const observer = new PerformanceObserver((entries) => handler(entries));
      observer.observe({ type: 'paint', buffered: true });
      return observer;
    },
    (_handler, observer: PerformanceObserver) => observer.disconnect(),
  ).pipe(
    filter((entries) =>
      entries.getEntries().some((entry) => entry.name === 'first-contentful-paint'),
    ),
    take(1),
  );
}

/** Commit Angular's UI and allow a frame to paint; initial startup also waits for observed FCP. */
export const AFTER_PAINT = new InjectionToken<AfterPaint>('AfterPaint', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    return (work) => {
      const lifetime = new Subscription();
      const render = afterNextRender(
        () => {
          lifetime.add(
            combineLatest([animationFrames().pipe(skip(1), take(1)), firstContentfulPaint()])
              .pipe(take(1))
              .subscribe(work),
          );
        },
        { injector },
      );
      lifetime.add(() => render.destroy());
      return () => lifetime.unsubscribe();
    };
  },
});
