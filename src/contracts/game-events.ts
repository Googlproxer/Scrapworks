import type { SceneKey } from './game-state';

export enum GameEvent {
  SCENE_LOADING = 'scrapworks:scene-loading',
  SCENE_READY = 'scrapworks:scene-ready',
  SCENE_STOPPED = 'scrapworks:scene-stopped',
  SCENE_ERROR = 'scrapworks:scene-error',
}

export interface SceneEvent {
  readonly sceneKey: SceneKey;
}

export interface SceneErrorEvent extends SceneEvent {
  readonly errorMessage: string;
}
