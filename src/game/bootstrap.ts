import type { GameClient } from '@contracts/game-client';
import { AUTO, Game, Scale, type Types } from 'phaser';
import { PhaserGameClient } from './bridge/phaser-game-client';
import { Boot } from './scenes/boot.scene';
import { Game as MainGame } from './scenes/game.scene';
import { MainMenu } from './scenes/main-menu.scene';
import { Preloader } from './scenes/preloader.scene';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Types.Core.GameConfig = {
  type: AUTO,
  scale: {
    mode: Scale.ScaleModes.RESIZE,
  },
  scene: [],
};

export function createGameClient(host: HTMLElement): GameClient {
  const game = new Game({ ...config, parent: host });
  const client = new PhaserGameClient(game);
  try {
    // Attach the bridge before any application scene can emit lifecycle events.
    game.scene.add('Boot', Boot);
    game.scene.add('Preloader', Preloader);
    game.scene.add('MainMenu', MainMenu);
    game.scene.add('Game', MainGame);
    game.scene.start('Boot');
    return client;
  } catch (error) {
    client.destroy();
    throw error;
  }
}
