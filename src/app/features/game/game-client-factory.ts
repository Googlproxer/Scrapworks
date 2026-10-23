import { InjectionToken } from '@angular/core';
import type { GameClient, GameClientOptions } from '@contracts/game-client';
import { createBabylonGameClient } from '@game/bootstrap';

export type GameClientFactory = (host: HTMLElement, options?: GameClientOptions) => GameClient;

export const GAME_CLIENT_FACTORY = new InjectionToken<GameClientFactory>('GameClientFactory', {
  providedIn: 'root',
  factory: () => createBabylonGameClient,
});
