import { Scene } from 'phaser';
import { reportSceneLoading } from './scene-lifecycle';

export class Boot extends Scene {
  public constructor() {
    super('Boot');
  }

  public init(): void {
    reportSceneLoading(this, 'Boot');
  }

  public preload() {
    //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
    //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

    this.load.image('background', 'assets/bg.png');
  }

  public create() {
    if (this.load.totalFailed > 0) return;
    this.scene.start('Preloader');
  }
}
