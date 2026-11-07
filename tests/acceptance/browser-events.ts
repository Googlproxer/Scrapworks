import type { Page, Worker } from 'playwright';
import type { EngineStore } from '@babylonjs/core';
import type { RuntimeReply, RuntimeRequest } from '../../src/contracts/simulation.ts';

interface BrowserEvents {
  dom(predicate: () => boolean, description?: string): Promise<void>;
  frame(predicate?: () => boolean, description?: string): Promise<void>;
  frames(count: number): Promise<void>;
}

interface WorkerUpdate {
  version: number;
  operation: RuntimeReply['operation'];
  active?: boolean;
  tick?: number;
}

declare global {
  interface Window {
    testEvents: BrowserEvents;
  }

  var workerTestEvents: {
    version: number;
    next(after: number, timeout: number, active?: boolean): Promise<WorkerUpdate>;
  };
}

/** Diagnostic listeners live only in this browser; no application hooks or timer polling. */
export async function installBrowserEvents(page: Page, engineStoreChunk?: string): Promise<void> {
  await page.addInitScript((chunk) => {
    const wait = (
      predicate: () => boolean,
      subscribe: (check: () => void, fail: (error: Error) => void) => () => void,
      description = 'browser event',
    ): Promise<void> =>
      new Promise((resolve, reject) => {
        let unsubscribe = () => undefined as void;
        const finish = (error?: unknown) => {
          clearTimeout(watchdog);
          unsubscribe();
          if (error) reject(error);
          else resolve();
        };
        // Failure bound only: success is driven by the observed event.
        const watchdog = setTimeout(() => finish(new Error(`Missing ${description}`)), 30_000);
        const check = () => {
          try {
            if (predicate()) finish();
          } catch (error) {
            finish(error);
          }
        };
        unsubscribe = subscribe(check, finish);
        check();
      });

    const frame = async (predicate = () => true, description = 'completed renderer frame') => {
      const module: Record<string, unknown> | undefined = chunk
        ? await import(new URL(chunk, document.baseURI).href)
        : undefined;
      const store =
        module &&
        Object.values(module).find(
          (value): value is typeof EngineStore =>
            typeof value === 'function' && 'LastCreatedEngine' in value && 'Instances' in value,
        );
      const engine = store
        ? store.LastCreatedEngine
        : ng
            .getComponent(document.querySelector('app-game-page'))
            .gameRuntimeService.client.currentScene.getEngine();
      if (!engine) throw new Error('Missing renderer');
      let rendered = false;
      await wait(
        () => rendered && predicate(),
        (check, fail) => {
          const observer = engine.onEndFrameObservable.add(() => {
            rendered = true;
            check();
          });
          const disposed = engine.onDisposeObservable.add(() =>
            fail(new Error('Renderer disposed while awaiting ' + description)),
          );
          return () => {
            engine.onEndFrameObservable.remove(observer);
            engine.onDisposeObservable.remove(disposed);
          };
        },
        description,
      );
    };
    window.testEvents = {
      dom: (predicate, description) =>
        wait(
          predicate,
          (check) => {
            const observer = new MutationObserver(check);
            observer.observe(document, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            });
            document.addEventListener('focusin', check);
            return () => {
              observer.disconnect();
              document.removeEventListener('focusin', check);
            };
          },
          description,
        ),
      frame,
      frames: async (count) => {
        for (let index = 0; index < count; index++) await frame();
      },
    };
  }, engineStoreChunk);
}

/** Observe real requests/replies without advancing or changing simulation authority. */
export async function installWorkerEvents(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const activities = new Map<number, boolean>();
    const activityReplies = new Map<number, WorkerUpdate>();
    const updates = new EventTarget();
    const history: WorkerUpdate[] = [];
    const publish = (update: WorkerUpdate) => {
      update.version = ++workerTestEvents.version;
      history.push(update);
      if (history.length > 128) history.shift();
      updates.dispatchEvent(new Event('reply'));
    };
    const publishActivity = (id: number) => {
      const reply = activityReplies.get(id);
      if (!reply || !activities.has(id)) return;
      publish({ ...reply, active: activities.get(id) });
      activities.delete(id);
      activityReplies.delete(id);
    };
    // Browser microtask checkpoints can deliver a reply before our request observer.
    // Rendezvous by request ID so neither listener's registration order matters.
    addEventListener('message', (event: MessageEvent<RuntimeRequest>) => {
      if (event.data.operation === 'activity') {
        activities.set(event.data.id, event.data.active);
        publishActivity(event.data.id);
      }
    });
    globalThis.workerTestEvents = {
      version: 0,
      next: (after, timeout, active) =>
        new Promise((resolve, reject) => {
          const finish = (update?: WorkerUpdate) => {
            clearTimeout(watchdog);
            updates.removeEventListener('reply', check);
            if (update) resolve(update);
            else
              reject(
                new Error(
                  `Missing worker reply after ${after}: ${JSON.stringify(history.slice(-8))}`,
                ),
              );
          };
          const check = () => {
            const update = history.find(
              (entry) =>
                entry.version > after &&
                (active === undefined ||
                  (entry.operation === 'activity' && entry.active === active)),
            );
            if (update) finish(update);
          };
          const watchdog = setTimeout(() => finish(), timeout);
          updates.addEventListener('reply', check);
          check();
        }),
    };
    const scope = globalThis as unknown as {
      postMessage(message: RuntimeReply, transfer?: Transferable[]): void;
    };
    const send = scope.postMessage.bind(globalThis);
    scope.postMessage = (reply, ...rest) => {
      send(reply, ...rest);
      const update = { version: 0, operation: reply.operation, tick: reply.packet?.tick };
      if (reply.operation === 'activity') {
        activityReplies.set(reply.id, update);
        publishActivity(reply.id);
      } else publish(update);
    };
  });
}

export const workerVersion = (worker: Worker): Promise<number> =>
  worker.evaluate(() => workerTestEvents.version);

export const nextWorkerReply = (
  worker: Worker,
  after: number,
  timeout = 30_000,
  active?: boolean,
) =>
  worker.evaluate(({ after, timeout, active }) => workerTestEvents.next(after, timeout, active), {
    after,
    timeout,
    active,
  });
