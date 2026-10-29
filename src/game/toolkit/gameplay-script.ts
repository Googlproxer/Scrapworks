import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { SceneManager, ScriptComponent } from '@babylonjs-toolkit/next/scenemanager';
import type { WorldSessionBridge } from '@contracts/game-client';
import type { GameTickContext } from '@contracts/game-tick';

export interface GameplayScriptOptions {
  readonly ticks?: Pick<WorldSessionBridge, 'registerCompletedTickHandler'>;
  readonly isCurrent?: () => boolean;
  readonly isGameplayActive?: () => boolean;
  readonly tickOrder?: number;
}

/** Toolkit owns frames; optional tick hooks present already completed simulation work. */
export abstract class GameplayScript extends ScriptComponent {
  public enabled = true;
  private attached = false;
  private started = false;
  private disposed = false;
  private disposing = false;
  private unregisterTick?: () => void;
  private readonly removeDisposalObservers: () => void;

  constructor(
    transform: TransformNode,
    scene: Scene,
    private readonly options: GameplayScriptOptions = {},
    alias?: string,
  ) {
    // Attach after construction, in explicit order, through Toolkit's public API.
    super(transform, scene, { _registerComponentAlias: false }, alias);
    const nodeDisposal = transform.onDisposeObservable.addOnce(() => this.dispose());
    const sceneDisposal = scene.onDisposeObservable.addOnce(() => this.dispose());
    this.removeDisposalObservers = () => {
      transform.onDisposeObservable.remove(nodeDisposal);
      scene.onDisposeObservable.remove(sceneDisposal);
    };
  }

  public get initialized(): boolean {
    return this.started && !this.disposed;
  }

  public attach(): void {
    if (this.attached || this.disposed) return;
    this.attached = true;
    // InitializeRuntime installs global loader/input settings which code-attached scripts
    // do not need. Registration itself supplies the native start/update/late lifecycle.
    SceneManager.AttachScriptComponent(this, this.getClassName());
  }

  public override dispose(): void {
    if (this.disposed || this.disposing) return;
    this.disposing = true;
    // Toolkit 9.30's ScriptComponent.dispose() is empty; this is its public teardown API.
    SceneManager.DestroyScriptComponent(this);
  }

  protected start(): void {
    if (this.disposed || this.started) return;
    if (this.onGameTick && this.options.ticks) {
      this.unregisterTick = this.options.ticks.registerCompletedTickHandler((context) => {
        if (
          this.canRun() &&
          SceneManager.ScenePlaying &&
          (this.options.isGameplayActive?.() ?? true)
        )
          this.onGameTick?.(context);
      }, this.options.tickOrder);
    }
    this.onStart?.();
    this.started = true;
  }

  protected update(): void {
    if (this.canRun()) this.onUpdate?.();
  }

  protected late(): void {
    if (this.canRun()) this.onLateUpdate?.();
  }

  protected destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.started = false;
    this.unregisterTick?.();
    this.unregisterTick = undefined;
    this.removeDisposalObservers();
    this.removeComponentMetadata();
    this.onDestroy?.();
  }

  protected onStart?(): void;
  protected onUpdate?(): void;
  protected onLateUpdate?(): void;
  /** Main-thread presentation only; the reported authoritative step has already completed. */
  protected onGameTick?(context: GameTickContext): void;
  protected onDestroy?(): void;

  private canRun(): boolean {
    return (
      this.started &&
      !this.disposed &&
      this.enabled &&
      !this.scene.isDisposed &&
      !this.transform.isDisposed() &&
      this.transform.isEnabled(true) &&
      (this.options.isCurrent?.() ?? true)
    );
  }

  private removeComponentMetadata(): void {
    // Toolkit removes observers but leaves its lookup record when a component is destroyed.
    const metadata: unknown = this.transform.metadata;
    if (!metadata || typeof metadata !== 'object' || !('toolkit' in metadata)) return;
    const toolkit = metadata.toolkit;
    if (!toolkit || typeof toolkit !== 'object' || !('components' in toolkit)) return;
    if (!Array.isArray(toolkit.components)) return;
    toolkit.components = toolkit.components.filter(
      (component: unknown) =>
        !component ||
        typeof component !== 'object' ||
        !('instance' in component) ||
        component.instance !== this,
    );
  }
}
