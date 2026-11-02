import type { GameClient, GameClientOptions } from '@game/client-api';
import { BabylonGameClient } from './babylon-game-client';

export function createBabylonGameClient(host: HTMLElement, options: GameClientOptions): GameClient {
  return new BabylonGameClient(host, undefined, options);
}
