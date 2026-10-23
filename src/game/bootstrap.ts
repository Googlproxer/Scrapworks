import type { GameClient, GameClientOptions } from '@contracts/game-client';
import { BabylonGameClient } from './babylon-game-client';

export function createBabylonGameClient(
  host: HTMLElement,
  options?: GameClientOptions,
): GameClient {
  return new BabylonGameClient(host, undefined, options);
}
