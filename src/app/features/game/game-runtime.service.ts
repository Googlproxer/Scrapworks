import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import type { GameClient } from '@contracts/game-client';
import type { GameState, SceneKey } from '@contracts/game-state';
import { GAME_CLIENT_FACTORY } from './game-client-factory';

@Service({ autoProvided: false })
export class GameRuntimeService {
  private readonly stateValue = signal<GameState>({
    phase: 'idle',
    sceneKey: null,
    errorMessage: null,
  });

  private readonly createClient = inject(GAME_CLIENT_FACTORY);
  private client?: GameClient;
  private host?: HTMLElement;
  private unsubscribe?: () => void;
  private generation = 0;
  private disposed = false;

  public readonly state = this.stateValue.asReadonly();
  public readonly currentSceneKey = computed(() => this.state().sceneKey);
  public readonly isReady = computed(() => this.state().phase === 'ready');
  public readonly isLoading = computed(() => this.state().phase === 'loading');
  public readonly errorMessage = computed(() => this.state().errorMessage);

  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.unmount();
    });
  }

  public mount(host: HTMLElement): void {
    if (this.disposed || (this.host === host && this.client)) return;
    this.unmount();
    const generation = ++this.generation;
    this.host = host;
    this.stateValue.set({ phase: 'loading', sceneKey: null, errorMessage: null });

    try {
      const client = this.createClient(host);
      if (this.disposed || generation !== this.generation) {
        client.destroy();
        return;
      }
      this.client = client;
      const unsubscribe = client.subscribe((state) => {
        if (generation === this.generation && this.client === client) this.stateValue.set(state);
      });
      if (generation === this.generation && this.client === client) this.unsubscribe = unsubscribe;
      else unsubscribe();
    } catch (error) {
      if (generation !== this.generation) return;
      this.unmount();
      console.error(error);
      if (this.disposed) return;
      this.host = host;
      this.stateValue.set({ phase: 'error', sceneKey: null, errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  public unmount(): void {
    if (!this.host && !this.client) return;
    ++this.generation;
    const client = this.client;
    const unsubscribe = this.unsubscribe;
    this.client = undefined;
    this.host = undefined;
    this.unsubscribe = undefined;
    unsubscribe?.();
    try {
      client?.destroy();
    } finally {
      this.stateValue.set({ phase: 'stopped', sceneKey: null, errorMessage: null });
    }
  }

  public setScene(key: SceneKey): void {
    if (!this.client || !this.isReady()) return;
    try {
      this.client.setScene(key);
    } catch (error) {
      this.stateValue.set({ phase: 'error', sceneKey: key, errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  public setInputEnabled(on: boolean) {
    if (!this.client || !this.isReady()) return;
    try {
      this.client.setInputEnabled(on);
    } catch (error) {
      this.stateValue.set({ phase: 'error', sceneKey: this.state().sceneKey, errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  public retry(): void {
    const host = this.host;
    if (!host || this.state().phase !== 'error' || this.disposed) return;
    this.unmount();
    this.mount(host);
  }
}
