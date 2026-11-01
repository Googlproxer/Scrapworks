import type { InspectorLoader } from './scene-inspector';
import { fromEventPattern, take } from 'rxjs';

export const loadInspector: InspectorLoader = async () => {
  const { ShowInspector } = await import('@babylonjs/inspector');
  return (scene, host) => {
    const token = ShowInspector(scene, {
      containerElement: host,
      layoutMode: 'overlay',
      autoResizeEngine: false,
      themeMode: 'dark',
    });
    return {
      dispose: () => token.dispose(),
      onClose: (listener) => {
        const subscription = fromEventPattern<void>(
          (emit) => token.onDisposed.add(() => emit()),
          (_emit, observer: { remove(): void }) => observer.remove(),
        )
          .pipe(take(1))
          .subscribe(listener);
        return () => subscription.unsubscribe();
      },
    };
  };
};
