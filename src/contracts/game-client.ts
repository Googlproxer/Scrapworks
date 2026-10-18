import type { GameState, SceneKey } from './game-state';

export interface GameClient {
  subscribe(listener: (state: GameState) => void): () => void;
  destroy(): void;

  //  methods angular may need to access
  setScene(key: SceneKey): void;
  setInputEnabled(on: boolean): void;
}
