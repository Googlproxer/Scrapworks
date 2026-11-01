import { Constants } from '@babylonjs/core/Engines/constants';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Node } from '@babylonjs/core/node';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { Scene } from '@babylonjs/core/scene';
import type { DebugDrawSettings, DebugDrawStatus } from '@contracts/debug-draw';
import type { WorldView } from '@contracts/world';
import { BehaviorSubject, Subscription, take } from 'rxjs';
import { fromBabylonObservable } from '../../lifecycle/from-babylon-observable';
import { compileDebugGeometry, type DebugGeometry, type DebugShape } from './geometry';
import type {
  DebugAttachment,
  DebugAttachmentOptions,
  DebugDrawCallback,
  DebugDrawWriter,
  SceneDebugDraw,
} from './types';

interface AttachmentRecord {
  readonly owner: Node;
  readonly options: DebugAttachmentOptions;
  readonly category: string;
  readonly callback: DebugDrawCallback;
  readonly subscriptions: Subscription;
  readonly cache: Map<string, { signature: string; geometry: DebugGeometry }>;
  readonly warnings: Set<string>;
  enabled: boolean;
  mesh?: LinesMesh;
  topology?: string;
  signature?: string;
}

/** Main-thread presentation only. No session, worker or simulation implementation imports. */
export class DevelopmentDebugDraw implements SceneDebugDraw {
  private readonly subscriptions = new Subscription();
  private readonly records = new Set<AttachmentRecord>();
  private readonly status = new BehaviorSubject<DebugDrawStatus>({
    available: true,
    categories: [],
  });
  private settings: DebugDrawSettings = { enabled: false, disabledCategories: [] };
  private isCurrent = () => true;
  private source?: () => WorldView | undefined;
  private generation?: number;
  private revision = 0;
  private frame = 0;
  private evaluatedFrame = -1;
  private disposed = false;
  private layer?: UtilityLayerRenderer;

  public constructor(private readonly scene: Scene) {
    this.subscriptions.add(
      fromBabylonObservable(scene.onBeforeRenderObservable).subscribe(() => this.frame++),
    );
    this.subscriptions.add(
      fromBabylonObservable(scene.onBeforeActiveMeshesEvaluationObservable).subscribe(() =>
        this.update(),
      ),
    );
    this.subscriptions.add(
      fromBabylonObservable(scene.onAfterRenderCameraObservable).subscribe((camera) => {
        if (camera === scene.activeCamera && this.valid() && this.layer?.shouldRender)
          this.layer.render();
      }),
    );
    this.subscriptions.add(
      fromBabylonObservable(scene.onDisposeObservable)
        .pipe(take(1))
        .subscribe(() => this.dispose()),
    );
  }

  /** Useful to inspect diagnostics without adding anything to the authored world scene. */
  public get renderingScene(): Scene | undefined {
    return this.layer?.utilityLayerScene;
  }

  public configure(settings: DebugDrawSettings, isCurrent: () => boolean): void {
    if (this.disposed) return;
    this.settings = {
      enabled: settings.enabled,
      disabledCategories: [...settings.disabledCategories],
    };
    this.isCurrent = isCurrent;
    this.revision++;
    this.hideAll();
  }

  public bindWorld(source: () => WorldView | undefined): void {
    this.source = source;
    this.generation = undefined;
    this.revision++;
    this.hideAll();
  }

  public subscribe(listener: (status: DebugDrawStatus) => void): () => void {
    const subscription = this.status.subscribe(listener);
    return () => subscription.unsubscribe();
  }

  public attach(
    owner: Node,
    options: DebugAttachmentOptions,
    callback: DebugDrawCallback,
  ): DebugAttachment {
    if (this.disposed || owner.isDisposed() || owner.getScene() !== this.scene)
      return { setEnabled: () => undefined, clear: () => undefined, dispose: () => undefined };
    const record: AttachmentRecord = {
      owner,
      options: { ...options },
      callback,
      category: options.category?.trim() || 'general',
      enabled: options.enabled ?? true,
      subscriptions: new Subscription(),
      cache: new Map(),
      warnings: new Set(),
    };
    this.records.add(record);
    record.subscriptions.add(
      fromBabylonObservable(owner.onDisposeObservable)
        .pipe(take(1))
        .subscribe(() => this.release(record)),
    );
    this.revision++;
    this.publish();
    return {
      setEnabled: (enabled) => {
        if (!this.records.has(record)) return;
        record.enabled = enabled;
        record.mesh?.setEnabled(false);
        this.revision++;
      },
      clear: (id) => {
        if (id === undefined) record.cache.clear();
        else record.cache.delete(id);
        record.mesh?.dispose();
        record.mesh = undefined;
        record.signature = undefined;
        record.topology = undefined;
        this.revision++;
      },
      dispose: () => this.release(record),
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revision++;
    this.subscriptions.unsubscribe();
    for (const record of this.records) {
      record.subscriptions.unsubscribe();
      record.mesh?.dispose();
      record.cache.clear();
    }
    this.records.clear();
    this.layer?.dispose();
    this.layer = undefined;
    this.status.complete();
    this.source = undefined;
  }

  private valid(): boolean {
    return (
      !this.disposed &&
      !this.scene.isDisposed &&
      this.isCurrent() &&
      (!this.source || !!this.source())
    );
  }

  private publish(): void {
    if (this.disposed) return;
    const categories = [...new Set([...this.records].map((record) => record.category))].sort();
    if (categories.join('\0') !== this.status.value.categories.join('\0'))
      this.status.next({ available: true, categories });
  }

  private release(record: AttachmentRecord): void {
    if (!this.records.delete(record)) return;
    this.revision++;
    record.subscriptions.unsubscribe();
    record.mesh?.dispose();
    record.cache.clear();
    this.publish();
  }

  private hideAll(): void {
    if (this.layer) this.layer.shouldRender = false;
    for (const record of this.records) record.mesh?.setEnabled(false);
  }

  private warn(record: AttachmentRecord, id: string, error: unknown): void {
    const message = `Debug draw (${record.owner.name}/${id}): ${error instanceof Error ? error.message : String(error)}`;
    if (!record.warnings.has(message)) {
      record.warnings.add(message);
      console.warn(message);
    }
  }

  private update(): void {
    if (this.evaluatedFrame === this.frame) return;
    this.evaluatedFrame = this.frame;
    this.hideAll();
    if (!this.valid() || !this.settings.enabled) return;
    const view = this.source?.();
    if (this.source && !view) return;
    if (view && this.generation !== view.worldGeneration) {
      this.generation = view.worldGeneration;
      for (const record of this.records) {
        record.cache.clear();
        record.signature = undefined;
      }
    }
    const revision = this.revision;
    for (const record of this.records) {
      if (!this.valid() || revision !== this.revision) break;
      if (
        !record.enabled ||
        !record.owner.isEnabled() ||
        record.owner.isDisposed() ||
        this.settings.disabledCategories.includes(record.category)
      )
        continue;
      const staged = new Map<string, DebugShape>();
      const writer: DebugDrawWriter = {
        line: (id, options) => staged.set(id, { kind: 'line', options }),
        ray: (id, options) => staged.set(id, { kind: 'ray', options }),
        arrow: (id, options) => staged.set(id, { kind: 'arrow', options }),
        circle: (id, options) => staged.set(id, { kind: 'circle', options }),
        sphere: (id, options) => staged.set(id, { kind: 'sphere', options }),
        box: (id, options) => staged.set(id, { kind: 'box', options }),
        axes: (id, options) => staged.set(id, { kind: 'axes', options }),
      };
      try {
        record.callback(writer);
        if (!this.valid() || revision !== this.revision || record.owner.isDisposed()) break;
        if (!record.owner.isEnabled()) continue;
        const geometries: DebugGeometry[] = [];
        const signatures: string[] = [];
        for (const [id, shape] of staged) {
          try {
            const signature = JSON.stringify(shape);
            let cached = record.cache.get(id);
            if (!cached || cached.signature !== signature) {
              cached = { signature, geometry: compileDebugGeometry(shape) };
              record.cache.set(id, cached);
            }
            geometries.push(cached.geometry);
            signatures.push(`${id}:${signature}`);
          } catch (error) {
            this.warn(record, id, error);
          }
        }
        if (geometries.length) this.present(record, geometries, signatures.join('\0'));
      } catch (error) {
        // RxJS subscribers must not be used to propagate synchronous frame exceptions.
        if (this.valid() && revision === this.revision) this.warn(record, 'provider', error);
      }
    }
    if (!this.valid() || revision !== this.revision) this.hideAll();
  }

  private present(record: AttachmentRecord, geometries: DebugGeometry[], signature: string): void {
    if (!this.layer) {
      this.layer = new UtilityLayerRenderer(this.scene, false, true);
      this.layer.pickingEnabled = false;
      this.layer.utilityLayerScene.autoClearDepthAndStencil = false;
      this.layer.utilityLayerScene.setRenderingAutoClearDepthStencil(0, false);
    }
    const topology = geometries
      .map((geometry) => geometry.lines.map((line) => line.length).join(','))
      .join(';');
    if (record.topology !== topology) {
      record.mesh?.dispose();
      record.mesh = undefined;
    }
    if (!record.mesh || record.signature !== signature) {
      const lines = geometries.flatMap((geometry) => geometry.lines);
      const colors = geometries.flatMap((geometry) => geometry.colors);
      record.mesh = CreateLineSystem(
        `debug:${record.owner.name}:${record.category}`,
        {
          lines,
          colors,
          updatable: true,
          instance: record.mesh,
        },
        this.layer.utilityLayerScene,
      );
      record.mesh.isPickable = false;
      record.mesh.alwaysSelectAsActiveMesh = true;
      record.mesh.metadata = { debugDraw: true, category: record.category };
      if (record.mesh.material) {
        record.mesh.material.disableDepthWrite = true;
        record.mesh.material.depthFunction =
          record.options.depthTest === false ? Constants.ALWAYS : Constants.LEQUAL;
      }
      record.signature = signature;
      record.topology = topology;
    }
    const mesh = record.mesh;
    if (record.options.space === 'world') {
      mesh.position.setAll(0);
      mesh.rotationQuaternion = Quaternion.Identity();
    } else {
      const rotation = mesh.rotationQuaternion ?? Quaternion.Identity();
      record.owner.computeWorldMatrix(true).decompose(undefined, rotation, mesh.position);
      // A rotated child under nonuniform parent scale can produce a non-unit decomposition.
      rotation.normalize();
      mesh.rotationQuaternion = rotation;
    }
    mesh.scaling.setAll(1);
    mesh.setEnabled(true);
    this.layer.shouldRender = true;
  }
}
