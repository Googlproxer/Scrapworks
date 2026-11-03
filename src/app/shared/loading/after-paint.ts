import { afterNextRender, inject, InjectionToken, Injector } from '@angular/core';
import { animationFrames, skip, Subscription, take } from 'rxjs';

export type AfterPaint = (work: () => void) => () => void;

/** Commit Angular's UI, then allow a paint between two animation-frame callbacks. */
export const AFTER_PAINT = new InjectionToken<AfterPaint>('AfterPaint', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    return (work) => {
      const lifetime = new Subscription();
      const render = afterNextRender(
        () => {
          lifetime.add(animationFrames().pipe(skip(1), take(1)).subscribe(work));
        },
        { injector },
      );
      lifetime.add(() => render.destroy());
      return () => lifetime.unsubscribe();
    };
  },
});
