import { GameEvent } from '@contracts/game-events';
import { Scale, Scene, Scenes } from 'phaser';
import { Player } from '../gameobjects/player';
import { reportSceneLoading } from './scene-lifecycle';

export class Game extends Scene {
  public camera?: Phaser.Cameras.Scene2D.Camera;

  public player?: Player;

  public constructor() {
    super('Game');
  }

  public init(): void {
    reportSceneLoading(this, 'Game');
  }

  public create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0x00ff00);

    this.player = new Player(this, 0, 0, 'player');

    const layout = () => {
      const { width, height } = this.scale;
      const camera = this.cameras.main;

      // The viewport fills the canvas.
      camera.setViewport(0, 0, width, height);

      // The player's world position appears at the viewport centre.
      camera.centerOn(this.player!.x, this.player!.y);
      //  TODO: keep camera centred on player once world is added.
    };

    // Apply the initial layout.
    layout();

    // Update it whenever the game size changes.
    this.scale.on(Scale.Events.RESIZE, layout);

    // Unsubscribe when this scene stops.
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Scale.Events.RESIZE, layout);
    });

    this.game.events.emit(GameEvent.SCENE_READY, { sceneKey: this.scene.key });
  }
}
