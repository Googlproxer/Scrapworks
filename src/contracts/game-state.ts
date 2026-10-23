export type SceneKey = 'MainMenu' | 'Game';
export type BabylonSceneKey = Extract<SceneKey, 'MainMenu' | 'Game'>;

export type GamePhase = 'idle' | 'loading' | 'ready' | 'stopped' | 'error' | 'paused';

export interface GameState {
  readonly phase: GamePhase;
  readonly sceneKey: SceneKey | null;
  readonly errorMessage: string | null;
}

const supportedScenes = new Set<SceneKey>(['MainMenu', 'Game']);

export const isValidSceneKey = (key: string): key is BabylonSceneKey =>
  supportedScenes.has(key as SceneKey);
