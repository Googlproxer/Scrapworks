import type { Scene } from '@babylonjs/core/scene';
import type { InspectorState } from '@contracts/game-client';

export interface InspectorHandle {
  dispose(): void | Promise<void>;
  onClose(listener: () => void): () => void;
}

export type InspectorFactory = (scene: Scene, host: HTMLElement) => InspectorHandle;
export type InspectorLoader = () => Promise<InspectorFactory | null>;

/** Owns one Inspector instance and invalidates lazy loads when its scene or request changes. */
export class SceneInspector {
  private value: InspectorState = { phase: 'closed', errorMessage: null };
  private revision = 0;
  private disposed = false;
  private scene?: Scene;
  private host?: HTMLElement;
  private handle?: InspectorHandle;
  private unsubscribeClose?: () => void;
  private unsubscribeScene?: () => void;
  private readonly cleanupTasks = new Set<Promise<void>>();
  private pendingCleanup?: Promise<void>;

  public constructor(
    private readonly loader: InspectorLoader,
    private readonly onState: (state: InspectorState) => void,
  ) {}

  public get state(): Readonly<InspectorState> {
    return this.value;
  }

  public async toggle(scene: Scene, host: HTMLElement): Promise<void> {
    if (this.disposed || scene.isDisposed) return;
    if (
      this.scene === scene &&
      this.host === host &&
      (this.value.phase === 'loading' || this.value.phase === 'open')
    ) {
      await this.close();
      return;
    }

    const revision = ++this.revision;
    this.release();
    if (!this.current(revision)) return;
    this.scene = scene;
    this.host = host;
    const observer = scene.onDisposeObservable.addOnce(() => {
      if (this.current(revision)) this.close();
    });
    this.unsubscribeScene = () => scene.onDisposeObservable.remove(observer);
    this.publish({ phase: 'loading', errorMessage: null });
    if (!this.current(revision)) return;

    try {
      if (this.pendingCleanup) await this.waitForCleanup();
      if (!this.current(revision) || scene.isDisposed) return;
      const factory = await this.loader();
      if (this.pendingCleanup) await this.waitForCleanup();
      if (!this.current(revision) || scene.isDisposed) return;
      if (!factory) {
        this.close();
        return;
      }
      const handle = factory(scene, host);
      if (!this.current(revision) || scene.isDisposed) {
        await this.disposeHandle(handle);
        return;
      }
      this.handle = handle;
      const unsubscribe = handle.onClose(() => {
        if (!this.current(revision) || this.handle !== handle) return;
        // Native close already disposed the Inspector; only release our subscriptions.
        this.handle = undefined;
        this.close();
      });
      if (!this.current(revision) || this.handle !== handle) {
        unsubscribe();
        return;
      }
      this.unsubscribeClose = unsubscribe;
      this.publish({ phase: 'open', errorMessage: null });
    } catch (error) {
      if (!this.current(revision)) return;
      this.release();
      this.publish({
        phase: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public close(): Promise<void> | undefined {
    const revision = ++this.revision;
    this.release();
    if (revision === this.revision) this.publish({ phase: 'closed', errorMessage: null });
    return this.pendingCleanup;
  }

  public dispose(): Promise<void> | undefined {
    if (this.disposed) return this.pendingCleanup;
    this.disposed = true;
    return this.close();
  }

  private current(revision: number): boolean {
    return !this.disposed && revision === this.revision;
  }

  private release(): void {
    const handle = this.handle;
    const unsubscribeClose = this.unsubscribeClose;
    const unsubscribeScene = this.unsubscribeScene;
    this.handle = undefined;
    this.unsubscribeClose = undefined;
    this.unsubscribeScene = undefined;
    this.scene = undefined;
    this.host = undefined;
    unsubscribeClose?.();
    unsubscribeScene?.();
    if (handle) this.disposeHandle(handle);
  }

  private async waitForCleanup(): Promise<void> {
    while (this.pendingCleanup) await this.pendingCleanup;
  }

  private disposeHandle(handle: InspectorHandle): Promise<void> | undefined {
    let result: void | Promise<void>;
    try {
      result = handle.dispose();
    } catch (error) {
      this.cleanupFailed(error);
      return this.pendingCleanup;
    }
    if (!result) return this.pendingCleanup;
    const task = Promise.resolve(result).catch((error) => {
      if (this.cleanupTasks.has(task)) this.cleanupFailed(error);
    });
    this.cleanupTasks.add(task);
    const pending = Promise.all([...this.cleanupTasks]).then(() => undefined);
    this.pendingCleanup = pending;
    void task.then(() => this.cleanupTasks.delete(task));
    void pending.then(() => {
      if (this.pendingCleanup === pending) this.pendingCleanup = undefined;
    });
    return pending;
  }

  private cleanupFailed(error: unknown): void {
    if (this.disposed) return;
    ++this.revision;
    this.release();
    this.publish({
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  private publish(state: InspectorState): void {
    if (this.value.phase === state.phase && this.value.errorMessage === state.errorMessage) return;
    this.value = state;
    this.onState(state);
  }
}
