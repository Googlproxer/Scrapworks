import type { Worker } from 'playwright';

/** Read-only timing wrappers in this diagnostic worker; never part of the production graph. */
export async function installWorkerProbe(worker: Worker, runtimeUrl: string): Promise<void> {
  await worker.evaluate(async (url) => {
    type Callable = (...args: unknown[]) => unknown;
    interface Runtime {
      world?: Record<string, Callable>;
      handle: Callable;
    }
    const module = (await import(url)) as Record<string, unknown>;
    const constructor = Object.values(module).find((value) => {
      const candidate = value as { prototype?: { handle?: unknown } } | null;
      return typeof value === 'function' && typeof candidate?.prototype?.handle === 'function';
    }) as { prototype: Runtime } | undefined;
    if (!constructor) throw new Error('Production runtime timing target not found in this build');
    const data: Record<string, number[]> = { step: [], publication: [], capture: [], handle: [] };
    (globalThis as unknown as { portfolioWorkerTiming: typeof data }).portfolioWorkerTiming = data;
    const wrapped = new WeakSet<object>(),
      original = constructor.prototype.handle;
    constructor.prototype.handle = function (this: Runtime, ...args: unknown[]) {
      const world = this.world;
      if (world && !wrapped.has(world)) {
        wrapped.add(world);
        for (const [method, key] of [
          ['step', 'step'],
          ['publish', 'publication'],
          ['capture', 'capture'],
        ] as const) {
          const fn = world[method];
          if (typeof fn !== 'function')
            throw new Error('Missing production simulation timing method ' + method);
          world[method] = function (...values: unknown[]) {
            const start = performance.now();
            try {
              return fn.apply(world, values);
            } finally {
              data[key].push(performance.now() - start);
            }
          };
        }
      }
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        data.handle.push(performance.now() - start);
      }
    };
  }, runtimeUrl);
}

export function readWorkerProbe(worker: Worker) {
  return worker.evaluate(
    () =>
      (globalThis as unknown as { portfolioWorkerTiming: Record<string, number[]> })
        .portfolioWorkerTiming,
  );
}
