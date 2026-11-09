import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { WorldScenePorts } from './world-scene-ports';
import type { ActionFrame } from '@contracts/input';
import type { WorldDefinition } from '@contracts/world';
import { loadCharacter, type CharacterLoader } from '../assets/load-character';
import { attachPresentationBehaviors } from '../lifecycle/attach-presentation-behaviors';
import type { PresentationBehavior } from '../lifecycle/presentation-behavior';
import { CameraController } from './camera-controller';
import { EntityViews } from './entity-views';
import { PlacementController } from './placement-controller';
import { PlayerController } from './player-controller';
import { PlayerView } from './player-view';
import { SelectionController } from './selection-controller';
import { SessionDriver } from './session-driver';
import { WorldFrame } from './world-frame';
import { attachDebugDraw, debugDrawForScene } from '../debug/draw/debug-draw';
import type { DebugAttachment } from '../debug/draw/types';
import { PLAYER_RADIUS } from '@simulation/world-rules';
import { OPENING_SETTINGS } from '@content/opening';
import { EnvironmentViews } from './environment-views';

/** Composition only: native Babylon hooks invoke ordered behaviors during scene.render(). */
export class WorldScene {
  public readonly player: PlayerView;
  public readonly playerController: PlayerController;
  public readonly camera: CameraController;
  public readonly entities: EntityViews;
  public readonly selection: SelectionController;
  public readonly placement: PlacementController;
  private readonly frame: WorldFrame;
  private readonly owner: TransformNode;
  private readonly scripts: PresentationBehavior[] = [];
  private readonly debugAttachments: DebugAttachment[] = [];
  private disposed = false;

  private constructor(
    scene: Scene,
    definition: WorldDefinition,
    character: AssetContainer,
    options: WorldScenePorts,
  ) {
    this.frame = new WorldFrame(options);
    this.owner = new TransformNode('world-scripts', scene);
    const player =
      scene.getTransformNodeByName('player-visual') ?? new TransformNode('player-visual', scene);

    const own = <T extends PresentationBehavior>(script: T): T => {
      this.scripts.push(script);
      return script;
    };

    try {
      debugDrawForScene(scene).bindWorld(() =>
        this.frame.isCurrent() ? this.frame.view : undefined,
      );
      for (const [category, radius, color] of [
        ['placement', OPENING_SETTINGS.reach, '#00ffff'],
        ['collision', PLAYER_RADIUS, '#ff9900'],
      ] as const)
        this.debugAttachments.push(
          attachDebugDraw(player, { category, space: 'world' }, (draw) => {
            const view = this.frame.view;
            if (view && this.frame.isCurrent())
              draw.circle('player-radius', {
                center: { ...view.player.position, y: view.player.position.y + 0.01 },
                radius,
                color,
              });
          }),
        );
      this.entities = own(new EntityViews(this.owner, definition, this.frame));
      this.camera = own(new CameraController(this.owner, player, this.frame));
      this.playerController = own(new PlayerController(player, this.frame, this.camera));
      this.player = own(new PlayerView(player, character, this.frame));
      this.selection = own(new SelectionController(this.owner, definition, this.frame));
      this.placement = own(
        new PlacementController(this.owner, definition, this.selection, this.frame),
      );
      const driver = own(new SessionDriver(this.owner, this.frame));
      const environment = own(new EnvironmentViews(this.owner, definition, this.frame));
      // Numeric phase order, deliberately independent of construction/array order.
      // Native update: controls -> input -> session -> player/entities.
      // Native late: camera follow -> selection -> placement, all before drawing.
      attachPresentationBehaviors([
        { script: this.camera, order: 10 },
        { script: this.playerController, order: 20 },
        { script: driver, order: 30 },
        { script: this.player, order: 40 },
        { script: this.entities, order: 50 },
        { script: environment, order: 55 },
        { script: this.selection, order: 60 },
        { script: this.placement, order: 70 },
      ]);
    } catch (error) {
      for (const attachment of this.debugAttachments) attachment.dispose();
      for (const script of [...this.scripts].reverse()) script.dispose();
      // Node disposal also catches a script whose constructor failed after its base initialized.
      player.dispose();
      this.owner.dispose();
      throw error;
    }
  }

  public static async create(
    scene: Scene,
    definition: WorldDefinition,
    options: WorldScenePorts,
    loadCharacterFn: CharacterLoader = loadCharacter,
  ): Promise<WorldScene> {
    const camera = scene.activeCamera;
    const character = await loadCharacterFn(scene);
    scene.activeCamera = camera;
    if (scene.isDisposed) {
      character.dispose();
      throw new Error('Character owner was disposed.');
    }
    try {
      return new WorldScene(scene, definition, character, options);
    } catch (error) {
      character.dispose();
      throw error;
    }
  }

  public get initialized(): boolean {
    return this.scripts.every((script) => script.initialized);
  }

  public beginFrame(
    input: ActionFrame,
    seconds: number,
    active: boolean,
    pointer: { x: number; y: number },
    isCurrent: () => boolean,
    simulationActive = active,
  ): void {
    this.frame.input = input;
    this.frame.seconds = seconds;
    this.frame.active = active;
    this.frame.simulationActive = simulationActive;
    this.frame.pointer = pointer;
    this.frame.movement = { x: 0, z: 0 };
    this.frame.sprint = false;
    this.frame.isCurrent = () => !this.disposed && isCurrent();
  }

  public endFrame(): void {
    this.frame.isCurrent = () => false;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.endFrame();
    for (const attachment of this.debugAttachments) attachment.dispose();
    for (const script of [...this.scripts].reverse()) script.dispose();
    this.player.root.dispose();
    this.owner.dispose();
  }
}
