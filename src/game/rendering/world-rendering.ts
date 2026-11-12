import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Engine } from '@babylonjs/core/Engines/engine';
import type { Node } from '@babylonjs/core/node';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Subscription } from 'rxjs';
import {
  defaultGraphicsSettings,
  resolveGraphicsSettings,
  shadowMapSizes,
  type GraphicsSettings,
  type GraphicsStatus,
} from '@contracts/graphics';
import { PresentationBehavior } from '../lifecycle/presentation-behavior';
import { fromBabylonObservable } from '../lifecycle/from-babylon-observable';
import type { WorldFrame } from '../views/world-frame';
import { applyProtagonistMaterial } from './protagonist-material';

/** One scene-owned lighting/shadow owner. Never writes to simulation or saves. */
export class WorldRendering extends PresentationBehavior {
  public readonly sun: DirectionalLight;
  private readonly createdLights: (DirectionalLight | HemisphericLight)[] = [];
  private readonly meshSubscriptions = new Subscription();
  private readonly pending = new Set<AbstractMesh>();
  private readonly casters = new Set<AbstractMesh>();
  private readonly characterMeshes: Set<AbstractMesh>;
  private shadow?: ShadowGenerator;
  private statusValue: GraphicsStatus = { shadows: 'medium', renderScale: 100, notice: null };

  public constructor(
    node: TransformNode,
    private readonly player: TransformNode,
    character: AssetContainer,
    frame: WorldFrame,
    settings: GraphicsSettings = defaultGraphicsSettings,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'WorldRendering');
    this.characterMeshes = new Set(character.meshes);
    const authoredSun = this.scene.getLightByName('painted-sun');
    const authoredFill = this.scene.getLightByName('light');
    // Synthetic fixtures can omit authored lights. Production exports supply both.
    this.sun =
      authoredSun instanceof DirectionalLight
        ? authoredSun
        : new DirectionalLight('painted-sun', new Vector3(0.5, -1, -0.6), this.scene);
    if (this.sun !== authoredSun) this.createdLights.push(this.sun);
    const fill =
      authoredFill instanceof HemisphericLight
        ? authoredFill
        : new HemisphericLight('light', Vector3.Up(), this.scene);
    if (fill !== authoredFill) this.createdLights.push(fill);
    if (this.sun !== authoredSun) {
      this.sun.direction = new Vector3(0.5, -1, -0.6).normalize();
      this.sun.diffuse = new Color3(1, 0.96, 0.9);
      this.sun.specular = this.sun.diffuse.clone();
      this.sun.intensity = 0.85;
      this.sun.shadowMinZ = 100;
      this.sun.shadowMaxZ = 5000;
    }
    if (fill !== authoredFill) {
      fill.intensity = 0.75;
      fill.diffuse = new Color3(1, 0.98, 0.94);
      fill.groundColor = new Color3(0.6, 0.55, 0.5);
    }
    applyProtagonistMaterial(character);
    for (const mesh of this.scene.meshes) this.pending.add(mesh);
    this.meshSubscriptions.add(
      fromBabylonObservable(this.scene.onNewMeshAddedObservable).subscribe((mesh) =>
        this.pending.add(mesh),
      ),
    );
    this.meshSubscriptions.add(
      fromBabylonObservable(this.scene.onMeshRemovedObservable).subscribe((mesh) => {
        this.pending.delete(mesh);
        this.casters.delete(mesh);
        this.shadow?.removeShadowCaster(mesh, false);
      }),
    );
    this.registerPending();
    this.applySettings(settings);
    this.positionSun();
  }

  public get status(): GraphicsStatus {
    return this.statusValue;
  }

  public get shadowGenerator(): ShadowGenerator | undefined {
    return this.shadow;
  }

  public applySettings(settings: GraphicsSettings): GraphicsStatus {
    const effective = resolveGraphicsSettings(
      settings,
      this.scene.getEngine().getCaps().maxTextureSize,
    );
    if (
      effective.shadows !== this.statusValue.shadows ||
      (!this.shadow && effective.shadows !== 'off')
    ) {
      let replacement: ShadowGenerator | undefined;
      if (effective.shadows !== 'off') {
        replacement = new ShadowGenerator(shadowMapSizes[effective.shadows], this.sun);
        const engine = this.scene.getEngine();
        const webgl2 = engine.isWebGPU || (engine instanceof Engine && engine.webGLVersion >= 2);
        replacement.usePercentageCloserFiltering = webgl2;
        replacement.usePoissonSampling = !webgl2;
        replacement.filteringQuality =
          effective.shadows === 'low'
            ? ShadowGenerator.QUALITY_LOW
            : ShadowGenerator.QUALITY_MEDIUM;
        // bias is normalised depth; only normalBias scales from preview metres to cm.
        replacement.bias = 0.0004;
        replacement.normalBias = 1.2;
        replacement.setDarkness(0.25);
        replacement.frustumEdgeFalloff = 0.15;
        for (const mesh of this.casters) replacement.addShadowCaster(mesh, false);
      }
      const previous = this.shadow;
      this.shadow = replacement;
      previous?.dispose();
    }
    this.scene.shadowsEnabled = effective.shadows !== 'off';
    this.sun.shadowEnabled = this.scene.shadowsEnabled;
    this.statusValue = effective;
    return effective;
  }

  private registerPending(): void {
    for (const mesh of this.pending) {
      if (mesh.isDisposed() || mesh instanceof LinesMesh || !mesh.getTotalVertices()) continue;
      let entity = false;
      for (let node: Node | null = mesh; node; node = node.parent) {
        const metadata: unknown = node.metadata;
        if (metadata && typeof metadata === 'object' && 'worldEntity' in metadata) {
          entity = true;
          break;
        }
      }
      const character = this.characterMeshes.has(mesh);
      const ground = mesh.name === 'environment-cells' || mesh.name === 'environment-water';
      const metadata: unknown = mesh.metadata;
      const scatter =
        !!metadata && typeof metadata === 'object' && 'environmentScatter' in metadata;
      const solid =
        entity ||
        character ||
        scatter ||
        mesh.name.startsWith('physics:') ||
        mesh.name === 'environment-vegetation';
      if (solid || ground) mesh.receiveShadows = true;
      if (solid && !mesh.material?.needAlphaBlendingForMesh(mesh)) {
        this.casters.add(mesh);
        this.shadow?.addShadowCaster(mesh, false);
      }
    }
    this.pending.clear();
  }

  private positionSun(): void {
    const camera = this.scene.activeCamera;
    const span = camera instanceof ArcRotateCamera ? Math.max(1600, camera.radius * 1.6) : 2000;
    // A player-centred projection preserves shadow detail close to the protagonist.
    if (this.sun.shadowFrustumSize !== span) this.sun.shadowFrustumSize = span;
    const centre = this.player.getAbsolutePosition(),
      direction = this.sun.direction;
    const x = centre.x - direction.x * 2500,
      y = centre.y - direction.y * 2500,
      z = centre.z - direction.z * 2500;
    if (!this.sun.position.equalsToFloats(x, y, z)) this.sun.position.set(x, y, z);
  }

  protected override onLateUpdate(): void {
    this.registerPending();
    this.positionSun();
  }

  protected override onDestroy(): void {
    this.meshSubscriptions.unsubscribe();
    this.pending.clear();
    this.casters.clear();
    this.shadow?.dispose();
    this.shadow = undefined;
    for (const light of this.createdLights) light.dispose();
  }
}
