import { InjectionToken } from '@angular/core';
import type { GameClient } from '@contracts/game-client';
import { createBabylonGameClient } from '@game/bootstrap';

export type GameClientFactory = (host: HTMLElement) => GameClient;

export const GAME_CLIENT_FACTORY = new InjectionToken<GameClientFactory>('GameClientFactory', {
  providedIn: 'root',
  factory: () => createBabylonGameClient,
});
