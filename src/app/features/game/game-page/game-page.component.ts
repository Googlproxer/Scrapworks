import { Component, inject } from '@angular/core';
import { GameRuntimeService } from '../game-runtime.service';
import { PhaserGame } from '../phaser-game/phaser-game.component';

@Component({
  imports: [PhaserGame],
  selector: 'app-game-page',
  styleUrl: './game-page.component.scss',
  templateUrl: './game-page.component.html',
  providers: [GameRuntimeService],
})
export class GamePageComponent {
  public readonly gameRuntimeService = inject(GameRuntimeService);

  public startGame() {
    this.gameRuntimeService.setScene('Game');
  }
}
