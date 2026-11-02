import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { WorldSessionBridge } from '@contracts/game-client';
import type { GameTickContext } from '@contracts/game-tick';
import { Subscription, take } from 'rxjs';
import { fromBabylonObservable } from './from-babylon-observable';
import { ScenePresentationLifecycle } from './scene-presentation-lifecycle';

export interface PresentationBehaviorOptions {
  readonly ticks?: Pick<WorldSessionBridge, 'registerCompletedTickHandler'>;
  readonly isCurrent?: () => boolean;
  readonly isGameplayActive?: () => boolean;
  readonly tickOrder?: number;
}

/** Scene-only behavior with owned resources and synchronous frame/tick execution. */
export abstract class PresentationBehavior {
  public enabled = true;
  private attached = false;
  private started = false;
  private disposed = false;
  private readonly subscriptions = new Subscription();

  public constructor(
    public readonly transform: TransformNode,
    public readonly scene: Scene,
    private readonly options: PresentationBehaviorOptions = {},
    public readonly alias?: string,
  ) {
    this.subscriptions.add(
      fromBabylonObservable(transform.onDisposeObservable)
        .pipe(take(1))
        .subscribe(() => this.dispose()),
    );
    this.subscriptions.add(
      fromBabylonObservable(scene.onDisposeObservable)
        .pipe(take(1))
        .subscribe(() => this.dispose()),
    );
  }

  public get initialized(): boolean {
    return this.started && !this.disposed;
  }

  public attach(order = 0): void {
    if (this.attached || this.disposed) return;
    this.attached = true;
    this.subscriptions.add(ScenePresentationLifecycle.forScene(this.scene).add(this, order));
  }

  public startFrame(): void {
    if (this.started || !this.canRun()) return;
    this.started = true;
    if (this.onGameTick && this.options.ticks)
      this.subscriptions.add(
        this.options.ticks.registerCompletedTickHandler((context) => {
          if (this.canRun() && (this.options.isGameplayActive?.() ?? true))
            this.onGameTick?.(context);
        }, this.options.tickOrder),
      );
    this.onStart?.();
  }

  public updateFrame(): void {
    if (this.started && this.canRun()) this.onUpdate?.();
  }

  public lateFrame(): void {
    if (this.started && this.canRun()) this.onLateUpdate?.();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.started = false;
    this.subscriptions.unsubscribe();
    this.onDestroy?.();
  }

  protected onStart?(): void;
  protected onUpdate?(): void;
  protected onLateUpdate?(): void;
  protected onGameTick?(context: GameTickContext): void;
  protected onDestroy?(): void;

  private canRun(): boolean {
    return (
      !this.disposed &&
      this.enabled &&
      !this.scene.isDisposed &&
      !this.transform.isDisposed() &&
      this.transform.isEnabled(true) &&
      (this.options.isCurrent?.() ?? true)
    );
  }
}
