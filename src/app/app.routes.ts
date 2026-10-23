import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/game/game-page/game-page.component').then((p) => p.GamePageComponent),
  },
];
