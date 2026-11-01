import type { SceneDebugDraw } from './types';

const attachment = {
  setEnabled: () => undefined,
  clear: () => undefined,
  dispose: () => undefined,
};

/** No scene access, event registration or provider evaluation, even when enabled. */
const noop: SceneDebugDraw = {
  attach: () => attachment,
  configure: () => undefined,
  bindWorld: () => undefined,
  subscribe: (listener) => {
    listener({ available: false, categories: [] });
    return () => undefined;
  },
  dispose: () => undefined,
};

export function createNoopDebugDraw(): SceneDebugDraw {
  return noop;
}
