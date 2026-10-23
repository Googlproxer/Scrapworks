import type { InspectorLoader } from './scene-inspector';

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
        const observer = token.onDisposed.add(listener);
        return () => {
          observer.remove();
        };
      },
    };
  };
};
