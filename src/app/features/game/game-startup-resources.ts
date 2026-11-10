import { signal } from '@angular/core';
import { assertWorldDefinition, type WorldDefinition } from '@contracts/world';
import { authoredMapKey } from '@core/authored-map';
import type { CharacterSource, StartupResources } from '../../../game/startup-resources';

type ResourceState = 'idle' | 'loading' | 'ready' | 'failed';

interface Request<T> {
  readonly controller: AbortController;
  readonly promise: Promise<T>;
  settled: boolean;
}

/** Page-owned source data; no renderer, storage, simulation or global loader state. */
export class GameStartupResources implements StartupResources {
  private base = '';
  private closed = false;
  private characterRequest?: Request<CharacterSource>;
  private definitionRequest?: Request<WorldDefinition>;
  private mapKey?: string;
  private readonly statusValue = signal<{ character: ResourceState; definition: ResourceState }>({
    character: 'idle',
    definition: 'idle',
  });
  public readonly status = this.statusValue.asReadonly();

  public constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  public configure(base: string): boolean {
    if (this.base === base) return false;
    this.invalidate();
    this.base = base;
    return true;
  }

  public preload(): void {
    void this.character().catch(() => undefined);
    void this.definition().catch(() => undefined);
  }

  public character(): Promise<CharacterSource> {
    if (this.closed) return Promise.reject(new Error('Game data loading is closed.'));
    if (this.characterRequest) return this.characterRequest.promise;
    const url = new URL('assets/models/protagonist-v3.glb', this.base);
    const controller = new AbortController();
    this.statusValue.update((s) => ({ ...s, character: 'loading' }));
    const promise = Promise.resolve()
      .then(() => this.request(url, { signal: controller.signal }))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Character download failed (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) throw new Error('Character download was cancelled.');
        return { bytes, rootUrl: new URL('.', url).href, name: 'protagonist-v3.glb' };
      });
    const entry: Request<CharacterSource> = { controller, promise, settled: false };
    this.characterRequest = entry;
    void promise.then(
      () => {
        entry.settled = true;
        if (this.characterRequest === entry)
          this.statusValue.update((s) => ({ ...s, character: 'ready' }));
      },
      () => {
        entry.settled = true;
        if (this.characterRequest === entry) {
          this.characterRequest = undefined;
          this.statusValue.update((s) => ({ ...s, character: 'failed' }));
        }
      },
    );
    return promise;
  }

  public definition(refresh = false): Promise<WorldDefinition> {
    if (this.closed) return Promise.reject(new Error('Game data loading is closed.'));
    if (this.definitionRequest && (!refresh || !this.definitionRequest.settled))
      return this.definitionRequest.promise.then((value) => structuredClone(value));
    const controller = new AbortController();
    this.statusValue.update((s) => ({ ...s, definition: 'loading' }));
    const url = new URL('scene/worlds/game.json', this.base);
    const promise = Promise.resolve()
      .then(() => this.request(url, { signal: controller.signal }))
      .then(async (response) => {
        if (!response.ok) throw new Error(`World definition failed to load (${response.status}).`);
        const definition: unknown = await response.json();
        assertWorldDefinition(definition);
        if (controller.signal.aborted) throw new Error('World data loading was cancelled.');
        const key = authoredMapKey(definition);
        if (this.mapKey !== undefined && this.mapKey !== key) this.resetCharacter();
        this.mapKey = key;
        return definition;
      });
    const entry: Request<WorldDefinition> = { controller, promise, settled: false };
    this.definitionRequest = entry;
    void promise.then(
      () => {
        entry.settled = true;
        if (this.definitionRequest === entry)
          this.statusValue.update((s) => ({ ...s, definition: 'ready' }));
      },
      () => {
        entry.settled = true;
        if (this.definitionRequest === entry) {
          this.definitionRequest = undefined;
          this.statusValue.update((s) => ({ ...s, definition: 'failed' }));
        }
      },
    );
    return promise.then((value) => structuredClone(value));
  }

  public invalidateCharacter(): void {
    // A renderer has proved these bytes unusable. Keep the menu's fallback status
    // truthful until the next required read retries, including after renderer Retry.
    this.resetCharacter('failed');
  }

  private resetCharacter(state: 'idle' | 'failed' = 'idle'): void {
    this.characterRequest?.controller.abort();
    this.characterRequest = undefined;
    this.statusValue.update((s) => ({ ...s, character: state }));
  }

  public invalidate(): void {
    this.resetCharacter();
    this.definitionRequest?.controller.abort();
    this.definitionRequest = undefined;
    this.mapKey = undefined;
    this.statusValue.set({ character: 'idle', definition: 'idle' });
  }

  public dispose(): void {
    this.closed = true;
    this.invalidate();
  }
}
