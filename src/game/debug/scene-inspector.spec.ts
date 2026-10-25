import { Observable } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { InspectorState } from '@contracts/game-client';
import { SceneInspector, type InspectorFactory, type InspectorHandle } from './scene-inspector';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createHandle() {
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const handle: InspectorHandle = {
    dispose: vi.fn(() => [...listeners].forEach((listener) => listener())),
    onClose: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        unsubscribe();
        listeners.delete(listener);
      };
    }),
  };
  return {
    handle,
    unsubscribe,
    nativeClose: () => [...listeners].forEach((listener) => listener()),
  };
}

function createScene(): Scene {
  // Inspector ownership only needs identity and disposal notifications.
  let disposed = false;
  const scene: Pick<Scene, 'isDisposed' | 'onDisposeObservable' | 'dispose'> = {
    get isDisposed() {
      return disposed;
    },
    onDisposeObservable: new Observable<Scene>(),
    dispose() {
      if (scene.isDisposed) return;
      disposed = true;
      scene.onDisposeObservable.notifyObservers(scene as Scene);
      scene.onDisposeObservable.clear();
    },
  };
  return scene as Scene;
}

describe('SceneInspector', () => {
  let scene: Scene;
  let host: HTMLElement;
  let helpers: SceneInspector[];

  beforeEach(() => {
    scene = createScene();
    host = document.createElement('div');
    helpers = [];
  });
  afterEach(async () => {
    await Promise.all(helpers.map((helper) => helper.dispose()));
    scene.dispose();
  });

  function create(
    loader: () => Promise<InspectorFactory | null>,
    onState = vi.fn<(state: InspectorState) => void>(),
  ) {
    const helper = new SceneInspector(loader, onState);
    helpers.push(helper);
    return helper;
  }

  it('loads only when requested, opens for the exact scene/host, and toggles its owned handle closed', async () => {
    const owned = createHandle();
    const factory = vi.fn(() => owned.handle);
    const loader = vi.fn(async () => factory);
    const onState = vi.fn();
    const helper = create(loader, onState);
    expect(loader).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
    const opened = helper.toggle(scene, host);
    expect(helper.state.phase).toBe('loading');
    await opened;
    expect(factory).toHaveBeenCalledExactlyOnceWith(scene, host);
    expect(helper.state).toEqual({ phase: 'open', errorMessage: null });
    await helper.toggle(scene, host);
    expect(helper.state.phase).toBe('closed');
    expect(owned.handle.dispose).toHaveBeenCalledOnce();
    expect(owned.unsubscribe).toHaveBeenCalledOnce();
    helper.close();
    expect(owned.handle.dispose).toHaveBeenCalledOnce();
  });

  it('cancels a pending import without ever creating the stale Inspector', async () => {
    const pending = deferred<InspectorFactory>();
    const factory = vi.fn(() => createHandle().handle);
    const helper = create(() => pending.promise);
    const opened = helper.toggle(scene, host);
    helper.close();
    pending.resolve(factory);
    await opened;
    expect(factory).not.toHaveBeenCalled();
    expect(helper.state.phase).toBe('closed');
  });

  it('permanently invalidates pending work on disposal', async () => {
    const pending = deferred<InspectorFactory>();
    const factory = vi.fn(() => createHandle().handle);
    const loader = vi.fn(() => pending.promise);
    const helper = create(loader);
    const opened = helper.toggle(scene, host);
    helper.dispose();
    pending.resolve(factory);
    await opened;
    await helper.toggle(scene, host);
    expect(loader).toHaveBeenCalledOnce();
    expect(factory).not.toHaveBeenCalled();
    expect(helper.state.phase).toBe('closed');
  });

  it('replaces an open scene without leaving the old close observer or handle active', async () => {
    const first = createHandle(),
      second = createHandle();
    const factory = vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const helper = create(async () => factory);
    await helper.toggle(scene, host);
    const replacement = createScene();
    await helper.toggle(replacement, host);
    expect(first.unsubscribe).toHaveBeenCalledOnce();
    expect(first.handle.dispose).toHaveBeenCalledOnce();
    expect(second.handle.dispose).not.toHaveBeenCalled();
    first.nativeClose();
    scene.dispose();
    expect(helper.state.phase).toBe('open');
    expect(factory).toHaveBeenLastCalledWith(replacement, host);
  });

  it('ignores stale import failures after a newer scene has opened', async () => {
    const first = deferred<InspectorFactory>();
    const owned = createHandle();
    const loader = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(() => owned.handle);
    const helper = create(loader);
    const stale = helper.toggle(scene, host);
    await helper.toggle(createScene(), host);
    first.reject(new Error('Old download failed'));
    await stale;
    expect(helper.state).toEqual({ phase: 'open', errorMessage: null });
    expect(owned.handle.dispose).not.toHaveBeenCalled();
  });

  it('reflects a native close once and releases its subscription without disposing twice', async () => {
    const owned = createHandle();
    const onState = vi.fn();
    const helper = create(async () => () => owned.handle, onState);
    await helper.toggle(scene, host);
    owned.nativeClose();
    owned.nativeClose();
    expect(helper.state.phase).toBe('closed');
    expect(owned.unsubscribe).toHaveBeenCalledOnce();
    expect(owned.handle.dispose).not.toHaveBeenCalled();
    expect(onState.mock.calls.map(([state]) => state.phase)).toEqual(['loading', 'open', 'closed']);
  });

  it('handles a synchronous native close while subscribing without publishing an open state', async () => {
    const unsubscribe = vi.fn();
    const dispose = vi.fn();
    const helper = create(async () => () => ({
      dispose,
      onClose: (listener) => {
        listener();
        return unsubscribe;
      },
    }));
    await helper.toggle(scene, host);
    expect(helper.state.phase).toBe('closed');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
  });

  it.each(['load', 'show'])(
    'reports a nonfatal %s failure and permits a fresh retry',
    async (phase) => {
      const owned = createHandle();
      const loader = vi.fn();
      if (phase === 'load') loader.mockRejectedValueOnce(new Error('Inspector unavailable'));
      else
        loader.mockResolvedValueOnce(() => {
          throw new Error('Inspector unavailable');
        });
      loader.mockResolvedValueOnce(() => owned.handle);
      const helper = create(loader);
      await helper.toggle(scene, host);
      expect(helper.state).toEqual({ phase: 'error', errorMessage: 'Inspector unavailable' });
      expect(scene.isDisposed).toBe(false);
      await helper.toggle(scene, host);
      expect(helper.state).toEqual({ phase: 'open', errorMessage: null });
    },
  );

  it('returns to closed when the build does not provide an Inspector factory', async () => {
    const helper = create(async () => null);
    await helper.toggle(scene, host);
    expect(helper.state).toEqual({ phase: 'closed', errorMessage: null });
    expect(scene.isDisposed).toBe(false);
  });

  it.each(['loading', 'open'])('closes %s ownership when its scene is disposed', async (phase) => {
    const pending = deferred<InspectorFactory>();
    const owned = createHandle();
    const factory = vi.fn(() => owned.handle);
    const helper = create(() => pending.promise);
    const opened = helper.toggle(scene, host);
    if (phase === 'open') {
      pending.resolve(factory);
      await opened;
    }
    scene.dispose();
    if (phase === 'loading') pending.resolve(factory);
    await opened;
    expect(helper.state.phase).toBe('closed');
    expect(factory).toHaveBeenCalledTimes(phase === 'open' ? 1 : 0);
    expect(owned.handle.dispose).toHaveBeenCalledTimes(phase === 'open' ? 1 : 0);
  });

  it('keeps independent helper ownership isolated', async () => {
    const first = createHandle(),
      second = createHandle();
    const firstHelper = create(async () => () => first.handle);
    const secondHelper = create(async () => () => second.handle);
    await firstHelper.toggle(scene, host);
    await secondHelper.toggle(createScene(), document.createElement('div'));
    firstHelper.dispose();
    expect(first.handle.dispose).toHaveBeenCalledOnce();
    expect(second.handle.dispose).not.toHaveBeenCalled();
    expect(secondHelper.state.phase).toBe('open');
  });

  it('honors synchronous cancellation from a loading notification before importing', async () => {
    const loader = vi.fn(async () => () => createHandle().handle);
    const helper = create(
      loader,
      vi.fn((state) => {
        if (state.phase === 'loading') helper.close();
      }),
    );
    await helper.toggle(scene, host);
    expect(loader).not.toHaveBeenCalled();
    expect(helper.state.phase).toBe('closed');
  });

  it('disposes a newly returned handle if its factory synchronously invalidates the request', async () => {
    const owned = createHandle();
    const helper = create(async () => () => {
      helper.close();
      return owned.handle;
    });
    await helper.toggle(scene, host);
    expect(owned.handle.dispose).toHaveBeenCalledOnce();
    expect(owned.handle.onClose).not.toHaveBeenCalled();
    expect(helper.state.phase).toBe('closed');
  });

  it('keeps close and dispose synchronous when no asynchronous Inspector cleanup exists', async () => {
    const helper = create(async () => null);
    expect(helper.close()).toBeUndefined();
    await helper.toggle(scene, host);
    expect(helper.close()).toBeUndefined();
    expect(helper.dispose()).toBeUndefined();
    expect(helper.dispose()).toBeUndefined();
  });

  it('returns waitable cleanup and does not reopen until asynchronous disposal finishes', async () => {
    const cleanup = deferred<void>();
    const first = createHandle(),
      second = createHandle();
    first.handle.dispose = vi.fn(() => cleanup.promise);
    const factory = vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const helper = create(async () => factory);
    await helper.toggle(scene, host);
    const closed = helper.close();
    expect(closed).toBeInstanceOf(Promise);
    expect(helper.close()).toBe(closed);
    const reopened = helper.toggle(scene, host);
    await Promise.resolve();
    expect(factory).toHaveBeenCalledOnce();
    expect(helper.state.phase).toBe('loading');
    cleanup.resolve();
    await closed;
    await reopened;
    expect(factory).toHaveBeenCalledTimes(2);
    expect(helper.state.phase).toBe('open');
    expect(first.handle.dispose).toHaveBeenCalledOnce();
    expect(helper.close()).toBeUndefined();
  });

  it('waits for old teardown and opens only the newest replacement request', async () => {
    const cleanup = deferred<void>();
    const first = createHandle(),
      second = createHandle();
    first.handle.dispose = vi.fn(() => cleanup.promise);
    const factory = vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const helper = create(async () => factory);
    await helper.toggle(scene, host);
    const supersededScene = createScene(),
      replacement = createScene();
    const superseded = helper.toggle(supersededScene, host);
    const newest = helper.toggle(replacement, host);
    expect(factory).toHaveBeenCalledOnce();
    cleanup.resolve();
    await Promise.all([superseded, newest]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenLastCalledWith(replacement, host);
    expect(helper.state.phase).toBe('open');
  });

  it('returns outstanding cleanup from permanent disposal and rejects later opening', async () => {
    const cleanup = deferred<void>();
    const owned = createHandle();
    owned.handle.dispose = vi.fn(() => cleanup.promise);
    const factory = vi.fn(() => owned.handle);
    const helper = create(async () => factory);
    await helper.toggle(scene, host);
    const disposed = helper.dispose();
    expect(disposed).toBeInstanceOf(Promise);
    expect(helper.dispose()).toBe(disposed);
    await helper.toggle(scene, host);
    expect(factory).toHaveBeenCalledOnce();
    cleanup.resolve();
    await disposed;
    expect(helper.dispose()).toBeUndefined();
    expect(helper.state.phase).toBe('closed');
  });

  it('contains cleanup rejection, cancels a waiting reopen, and permits a subsequent retry', async () => {
    const cleanup = deferred<void>();
    const first = createHandle(),
      second = createHandle();
    first.handle.dispose = vi.fn(() => cleanup.promise);
    const factory = vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const helper = create(async () => factory);
    await helper.toggle(scene, host);
    const closed = helper.close();
    const reopen = helper.toggle(scene, host);
    cleanup.reject(new Error('Inspector teardown failed'));
    await expect(closed).resolves.toBeUndefined();
    await reopen;
    expect(helper.state).toEqual({ phase: 'error', errorMessage: 'Inspector teardown failed' });
    expect(factory).toHaveBeenCalledOnce();
    await helper.toggle(scene, host);
    expect(helper.state.phase).toBe('open');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('contains late teardown rejection after disposal without publishing stale error state', async () => {
    const cleanup = deferred<void>();
    const owned = createHandle();
    owned.handle.dispose = vi.fn(() => cleanup.promise);
    const onState = vi.fn();
    const helper = create(async () => () => owned.handle, onState);
    await helper.toggle(scene, host);
    const disposed = helper.dispose();
    cleanup.reject(new Error('Late teardown failure'));
    await expect(disposed).resolves.toBeUndefined();
    expect(helper.state.phase).toBe('closed');
    expect(onState.mock.calls.map(([state]) => state.phase)).toEqual(['loading', 'open', 'closed']);
  });

  it('reports a synchronous cleanup exception without throwing through scene teardown', async () => {
    const owned = createHandle();
    owned.handle.dispose = vi.fn(() => {
      throw new Error('Cleanup failed');
    });
    const helper = create(async () => () => owned.handle);
    await helper.toggle(scene, host);
    expect(helper.close()).toBeUndefined();
    expect(helper.state).toEqual({ phase: 'error', errorMessage: 'Cleanup failed' });
  });
});
