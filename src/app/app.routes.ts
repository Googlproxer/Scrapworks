import { Routes } from '@angular/router';
import { createBabylonGameClient } from '@game/babylon/bootstrap';
import { GAME_CLIENT_FACTORY } from './features/game/game-client-factory';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/game/game-page/game-page.component').then((p) => p.GamePageComponent),
  },
  {
    path: '3d',
    providers: [
      {
        provide: GAME_CLIENT_FACTORY,
        useValue: createBabylonGameClient,
      },
    ],
    loadComponent: () => import('./features/game/game-page/game-page.component').then((p) => p.GamePageComponent),
  },
];
