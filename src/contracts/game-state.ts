export type SceneKey = 'Boot' | 'Preloader' | 'MainMenu' | 'Game';

export type GamePhase = 'idle' | 'loading' | 'ready' | 'stopped' | 'error';

export interface GameState {
  readonly phase: GamePhase;
  readonly sceneKey: SceneKey | null;
  readonly errorMessage: string | null;
}
