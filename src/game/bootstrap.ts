import type { GameClient } from '@contracts/game-client';
import { BabylonGameClient } from './babylon-game-client';

export function createBabylonGameClient(host: HTMLElement): GameClient {
  return new BabylonGameClient(host);
}
