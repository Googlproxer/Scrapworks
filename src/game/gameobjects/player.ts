import { Vector2 } from '@core/math/vector2';
import { GameObjects, Scene, Scenes } from 'phaser';

export class Player extends GameObjects.Sprite {
  private moveSpeed = 200; // pixels per second
  private moveDirection: Vector2 = new Vector2(0, 0);

  private sprintSpeed = 400; // pixels per second

  private isSprinting = false;

  private visualHeight = 96; // height of the player sprite
  private visualWidth = 64; // width of the player sprite

  public constructor(scene: Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);

    this.setSize(this.visualWidth, this.visualHeight); // Set the size of the player sprite
    this.setDisplaySize(this.visualWidth, this.visualHeight); // Set the display size of the player sprite
    this.setInteractive();

    if (!scene.input.keyboard) {
      throw new Error('Keyboard input is not available in this scene.');
    }
    // input handling WASD for movement, include render delta for smooth movement
    const keyboard = scene.input.keyboard;
    keyboard.on('keydown-W', () => {
      this.moveDirection.y = -1;
    });
    keyboard.on('keydown-S', () => {
      this.moveDirection.y = 1;
    });
    keyboard.on('keydown-A', () => {
      this.moveDirection.x = -1;
    });
    keyboard.on('keydown-D', () => {
      this.moveDirection.x = 1;
    });
    keyboard.on('keyup-W', () => {
      if (this.moveDirection.y === -1) this.moveDirection.y = 0;
    });
    keyboard.on('keyup-S', () => {
      if (this.moveDirection.y === 1) this.moveDirection.y = 0;
    });
    keyboard.on('keyup-A', () => {
      if (this.moveDirection.x === -1) this.moveDirection.x = 0;
    });
    keyboard.on('keyup-D', () => {
      if (this.moveDirection.x === 1) this.moveDirection.x = 0;
    });

    keyboard.on('keydown-SHIFT', () => {
      this.isSprinting = true;
    });
    keyboard.on('keyup-SHIFT', () => {
      this.isSprinting = false;
    });

    //  clean up event listeners when the scene is shutdown
    scene.events.once(Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-W');
      keyboard.off('keydown-S');
      keyboard.off('keydown-A');
      keyboard.off('keydown-D');
      keyboard.off('keyup-W');
      keyboard.off('keyup-S');
      keyboard.off('keyup-A');
      keyboard.off('keyup-D');
    });

    this.addToUpdateList();
  }

  public override preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.handleMovement(this.moveDirection, delta / 1000); // delta is in ms, convert to seconds
  }

  private handleMovement(direction: Vector2, deltaTime: number) {
    const distance = (this.isSprinting ? this.sprintSpeed : this.moveSpeed) * deltaTime;
    this.x += direction.x * distance;
    this.y += direction.y * distance;
  }

  public moveTo(x: number, y: number) {
    this.setPosition(x, y);
  }
}
