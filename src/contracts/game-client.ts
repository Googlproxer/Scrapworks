import type { GameState, SceneKey } from './game-state';

export interface GameClient {
  subscribe(listener: (state: GameState) => void): () => void;
  destroy(): void;

  setScene(key: SceneKey): void;
}
