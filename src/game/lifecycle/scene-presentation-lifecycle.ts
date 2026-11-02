import type { Scene } from '@babylonjs/core/scene';
import { Subscription } from 'rxjs';
import type { PresentationBehavior } from './presentation-behavior';

/** One synchronous ordered dispatcher inside Babylon's existing render, never another clock. */
export class ScenePresentationLifecycle {
  private static readonly owners = new WeakMap<Scene, ScenePresentationLifecycle>();
  private readonly subscriptions = new Subscription();
  private readonly entries: { behavior: PresentationBehavior; order: number; serial: number }[] =
    [];
  private serial = 0;
  private disposed = false;
  private latePending = false;

  public static forScene(scene: Scene): ScenePresentationLifecycle {
    let owner = this.owners.get(scene);
    if (!owner) {
      owner = new ScenePresentationLifecycle(scene);
      this.owners.set(scene, owner);
    }
    return owner;
  }

  private constructor(scene: Scene) {
    // Ordered frame exceptions must propagate synchronously into BabylonGameClient's boundary.
    const update = scene.onBeforeRenderObservable.add(() => this.update());
    const late = scene.onBeforeRenderTargetsRenderObservable.add(() => {
      // Babylon also fires this hook per camera; late work belongs to the owned frame once.
      if (!this.latePending) return;
      this.latePending = false;
      for (const entry of [...this.entries]) entry.behavior.lateFrame();
    });
    const disposal = scene.onDisposeObservable.add(() => this.dispose());
    this.subscriptions.add(() => scene.onBeforeRenderObservable.remove(update));
    this.subscriptions.add(() => scene.onBeforeRenderTargetsRenderObservable.remove(late));
    this.subscriptions.add(() => scene.onDisposeObservable.remove(disposal));
  }

  public add(behavior: PresentationBehavior, order: number): () => void {
    if (this.disposed) return () => undefined;
    const entry = { behavior, order, serial: this.serial++ };
    this.entries.push(entry);
    this.entries.sort((a, b) => a.order - b.order || a.serial - b.serial);
    return () => {
      const index = this.entries.indexOf(entry);
      if (index >= 0) this.entries.splice(index, 1);
    };
  }

  private update(): void {
    this.latePending = true;
    const entries = [...this.entries];
    for (const entry of entries) entry.behavior.startFrame();
    for (const entry of entries) entry.behavior.updateFrame();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscriptions.unsubscribe();
    for (const entry of [...this.entries].reverse()) entry.behavior.dispose();
    this.entries.length = 0;
  }
}
