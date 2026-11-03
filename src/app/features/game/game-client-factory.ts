import { InjectionToken } from '@angular/core';
import type { GameClient, GameClientOptions } from '@game/client-api';

export type GameClientFactory = (host: HTMLElement, options: GameClientOptions) => GameClient;
export type GameClientLoader = () => Promise<GameClientFactory>;

export const GAME_CLIENT_LOADER = new InjectionToken<GameClientLoader>('GameClientLoader', {
  providedIn: 'root',
  factory: () => () => import('@game/bootstrap').then((module) => module.createBabylonGameClient),
});
