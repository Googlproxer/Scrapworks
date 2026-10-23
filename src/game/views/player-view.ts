import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { WorldView } from '@contracts/world';
import { GameplayScript } from '../toolkit/gameplay-script';
import type { WorldFrame } from './world-frame';

const characterClips = ['Idle', 'Walk', 'Run'];
const facingSpeeds = { moving: Math.PI * 1.5, left: 1.3453665, right: 1.3463967 };
export class PlayerView extends GameplayScript {
  private readonly animations = new Map<string, AnimationGroup>();
  private activeClip = 'Idle';
  private readonly weights = new Map<string, number>();
  private previousPosition?: Vector3;
  private targetPosition?: Vector3;
  private interpolation = 1;
  private lastTick = -1;
  public constructor(
    public readonly root: TransformNode,
    private readonly character: AssetContainer,
    private readonly frame: WorldFrame,
  ) {
    super(root, root.getScene(), frame.scriptOptions, 'PlayerView');
    const importedRoots = character.rootNodes;
    character.addAllToScene();
    for (const node of importedRoots) if (node instanceof TransformNode) node.parent = this.root;
    // GLB is in metres; Editor anchors and world rendering use centimetres.
    this.root.scaling.setAll(100);
    for (const mesh of character.meshes) mesh.isPickable = false;
    // Retained turn clips must never compete with locomotion and smooth root rotation.
    for (const animation of character.animationGroups) animation.stop();
    for (const animation of character.animationGroups) {
      const name = animation.name.split('|').at(-1)!;
      if (!characterClips.includes(name)) continue;
      animation.start(true, 1);
      animation.setWeightForAllAnimatables(name === 'Idle' ? 1 : 0);
      this.animations.set(name, animation);
      this.weights.set(name, name === 'Idle' ? 1 : 0);
    }
    for (const name of characterClips)
      if (!this.animations.has(name)) throw new Error(`Character clip missing: ${name}`);
  }
  protected override onUpdate(): void {
    if (this.frame.view) this.present(this.frame.view, this.frame.seconds, this.frame.active);
  }
  public present(view: WorldView, seconds: number, active: boolean): void {
    const position = new Vector3(
      view.player.position.x * 100,
      view.player.position.y * 100,
      view.player.position.z * 100,
    );
    if (view.tick !== this.lastTick) {
      if (this.lastTick < 0) this.root.rotation.y = view.player.facing;
      this.previousPosition = this.root.position.clone();
      this.targetPosition = position;
      this.interpolation = this.lastTick < 0 ? 1 : 0;
      this.lastTick = view.tick;
    }
    this.interpolation = Math.min(1, this.interpolation + seconds / view.stepSeconds);
    if (this.previousPosition && this.targetPosition)
      Vector3.LerpToRef(
        this.previousPosition,
        this.targetPosition,
        this.interpolation,
        this.root.position,
      );
    if (active) {
      this.updateFacing(view, Math.max(0, seconds));
      this.activeClip = view.player.moving ? (view.player.sprinting ? 'Run' : 'Walk') : 'Idle';
    }

    for (const [name, animation] of this.animations) {
      const desired = name === this.activeClip ? 1 : 0;
      const weight =
        (this.weights.get(name) ?? 0) +
        (desired - (this.weights.get(name) ?? 0)) *
          (active ? 1 - Math.exp(-Math.max(0, seconds) * 16) : 0);
      this.weights.set(name, weight);
      animation.setWeightForAllAnimatables(weight);
      animation.speedRatio = name === 'Walk' ? 1.5 / 1.5097235 : name === 'Run' ? 3 / 3.3952876 : 1;
      if (active) {
        if (!animation.isPlaying) animation.play(true);
      } else animation.pause();
    }
  }
  private updateFacing(view: WorldView, seconds: number): void {
    const difference = Math.atan2(
      Math.sin(view.player.facing - this.root.rotation.y),
      Math.cos(view.player.facing - this.root.rotation.y),
    );
    const speed = view.player.moving
      ? facingSpeeds.moving
      : difference < 0
        ? facingSpeeds.left
        : facingSpeeds.right;
    const step = Math.sign(difference) * Math.min(Math.abs(difference), speed * seconds);
    const heading = this.root.rotation.y + step;
    this.root.rotation.y = Math.atan2(Math.sin(heading), Math.cos(heading));
  }

  protected override onDestroy(): void {
    this.character.dispose();
  }
}
