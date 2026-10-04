import { Loader, Scale, Scene, Scenes } from 'phaser';
import { reportSceneLoading } from './scene-lifecycle';

export class Preloader extends Scene {
  public constructor() {
    super('Preloader');
  }

  public init() {
    reportSceneLoading(this, 'Preloader');
    //  We loaded this image in our Boot Scene, so we can display it here
    const background = this.add.image(512, 384, 'background');

    //  A simple progress bar. This is the outline of the bar.
    const border = this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

    //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
    const bar = this.add.rectangle(512 - 230, 384, 4, 28, 0xffffff);

    //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
    const onProgress = (progress: number) => {
      //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
      bar.width = 4 + 460 * progress;
    };
    this.load.on(Loader.Events.PROGRESS, onProgress);

    const layout = () => {
      const { width, height } = this.scale;
      const centreX = width / 2;
      const centreY = height / 2;
      border.setPosition(centreX, centreY);
      bar.x = centreX - 230;
      bar.y = centreY;

      background.setPosition(centreX, centreY);
    };

    // Apply the initial layout.
    layout();

    // Update it whenever the game size changes.
    this.scale.on(Scale.Events.RESIZE, layout);

    // Unsubscribe when this scene stops.
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Scale.Events.RESIZE, layout);
      this.load.off(Loader.Events.PROGRESS, onProgress);
    });
  }

  public preload() {
    //  Load the assets for the game - Replace with your own assets
    this.load.setPath('assets');

    this.load.image('logo', 'logo.png');

    this.load.image('player', 'player/player.png');
  }

  public create() {
    if (this.load.totalFailed > 0) return;
    //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
    //  For example, you can define global animations here, so we can use them in other scenes.

    //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
    this.scene.start('MainMenu');
  }
}
