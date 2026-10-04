import { GameEvent } from '@contracts/game-events';
import { GameObjects, Scale, Scene, Scenes } from 'phaser';
import { reportSceneLoading } from './scene-lifecycle';

export class MainMenu extends Scene {
  public background?: GameObjects.Image;
  public logo?: GameObjects.Image;

  public constructor() {
    super('MainMenu');
  }

  public init(): void {
    reportSceneLoading(this, 'MainMenu');
  }

  public create() {
    this.background = this.add.image(512, 384, 'background');

    this.logo = this.add.image(512, 300, 'logo').setDepth(100);

    const layout = () => {
      const { width, height } = this.scale;
      const logo = this.logo!;
      const availableWidth = Math.min(560, Math.max(1, width - 48));
      const availableHeight = Math.max(1, height * 0.28);

      this.background!.setPosition(width / 2, height / 2);
      logo.setPosition(width / 2, height / 2).setScale(Math.min(availableWidth / logo.width, availableHeight / logo.height));
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
