import { Subscription, type Observable } from 'rxjs';
import type { GameClient, GameClientOptions } from '@game/client-api';
import type { GameClientFactory } from './game-client-factory';
import type { GameState } from '@contracts/game-state';
import type { WorldSelection, PlacementFeedback, InspectorState } from '@contracts/game-client';
import type { DebugDrawSettings, DebugDrawStatus } from '@contracts/debug-draw';
import type { LoadingStatus } from '@contracts/loading';

interface RendererNotifications {
  state(value: GameState): void;
  loading(value: LoadingStatus | null): void;
  selection(value: WorldSelection): void;
  placementFeedback(value: PlacementFeedback | null): void;
  inspectorState(value: InspectorState): void;
  debugDrawStatus(value: DebugDrawStatus): void;
}

/** Owns the renderer and all subscriptions to that renderer generation. */
export class RendererConnection {
  private clientValue?: GameClient;
  private hostValue?: HTMLElement;
  private revision = 0;
  private lifetime = new Subscription();

  public get client(): GameClient | undefined {
    return this.clientValue;
  }

  public get host(): HTMLElement | undefined {
    return this.hostValue;
  }

  public get generation(): number {
    return this.revision;
  }

  public invalidate(): void {
    ++this.revision;
  }

  public begin(host: HTMLElement): number {
    this.hostValue = host;
    this.lifetime = new Subscription();
    return ++this.revision;
  }

  public create(factory: GameClientFactory, options: GameClientOptions): GameClient {
    if (!this.hostValue) throw new Error('Renderer host is absent');
    const generation = this.revision;
    const client = factory(this.hostValue, options);
    if (generation !== this.revision) {
      client.destroy();
      return client;
    }
    this.clientValue = client;
    return client;
  }

  public connect(handlers: RendererNotifications): () => void {
    const client = this.clientValue;
    if (!client) throw new Error('Renderer client is absent');
    const generation = this.revision;
    const subscriptions = new Subscription();
    this.lifetime.add(subscriptions);

    const listen = <T>(stream: Observable<T>, notify: (value: T) => void) =>
      subscriptions.add(
        stream.subscribe((value) => {
          if (generation === this.revision && this.clientValue === client) notify(value);
        }),
      );

    listen(client.loading$, handlers.loading);
    listen(client.state$, handlers.state);
    listen(client.selection$, handlers.selection);
    listen(client.inspectorState$, handlers.inspectorState);
    listen(client.debugDrawStatus$, handlers.debugDrawStatus);
    listen(client.placementFeedback$, handlers.placementFeedback);
    return () => subscriptions.unsubscribe();
  }

  public configureDebug(settings: DebugDrawSettings): void {
    this.clientValue?.setDebugDrawSettings(settings);
  }

  public unmount(): void {
    ++this.revision;
    this.lifetime.unsubscribe();
    const client = this.clientValue;
    this.clientValue = undefined;
    this.hostValue = undefined;
    client?.destroy();
  }
}
