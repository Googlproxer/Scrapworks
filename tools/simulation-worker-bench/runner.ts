import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Protocol } from '../cdp.ts';
import { pageProfilingContext, type ProfilingContext } from '../cdp.ts';
import type { Job } from './jobs.ts';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const job = JSON.parse(process.argv[2]) as Job;
const cache = path.join(os.homedir(), 'AppData/Local/ms-playwright');
if (process.platform === 'win32' && !process.env.PLAYWRIGHT_BROWSERS_PATH)
  process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
const browser = await chromium.launch({
  headless: true,
  args: [
    '--js-flags=--expose-gc',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
const begin = performance.now();
try {
  await page.goto(job.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.simulationWorkerBench);
  const context = await page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    isolated: crossOriginIsolated,
    sharedMemoryAvailable: typeof SharedArrayBuffer !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
  }));
  const root = await browser.newBrowserCDPSession();
  const engine = await root.send('Browser.getVersion');
  const launch: Partial<Protocol.Browser.getBrowserCommandLineReturnValue> & {
    unavailable?: string;
    configuredArgs?: string[];
    osCommandLine?: string;
    osCommandLineUnavailable?: string;
  } = await root.send('Browser.getBrowserCommandLine').catch((error) => ({
    unavailable: String(error),
    configuredArgs: [
      '--js-flags=--expose-gc',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  }));
  if (launch.arguments)
    launch.arguments = launch.arguments.map((argument) =>
      argument.startsWith('--user-data-dir=') ? '--user-data-dir=<fresh-profile>' : argument,
    );
  if (!launch.arguments && job.mode === 'check' && process.platform === 'win32') {
    try {
      const { processInfo } = await root.send('SystemInfo.getProcessInfo');
      const pid = processInfo.find((info) => info.type === 'browser')?.id;
      if (!Number.isSafeInteger(pid)) throw new Error('Browser PID unavailable');
      launch.osCommandLine = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`,
        ],
        { encoding: 'utf8', windowsHide: true },
      )
        .trim()
        .replace(/--user-data-dir=(?:"[^"]*"|\S+)/g, '--user-data-dir=<fresh-profile>');
    } catch (error) {
      launch.osCommandLineUnavailable = String(error);
    }
  }
  const loadedMs = performance.now() - begin;
  let result;
  if (job.mode === 'check')
    result = await page.evaluate(async (options) => {
      const checked = await window.simulationWorkerBench.correctness(options);
      checked.assertions.push(await window.simulationWorkerBench.frameTimingProbe());
      return checked;
    }, job.options);
  else if (job.mode === 'trial')
    result = await page.evaluate(
      (options) => window.simulationWorkerBench.trial(options),
      job.options,
    );
  else if (job.mode === 'paced')
    result = await page.evaluate(
      (options) =>
        window.simulationWorkerBench.paced({
          ...options,
          durationMs: options.durationMs!,
          pressureMs: options.pressureMs!,
        }),
      job.options,
    );
  else if (job.mode === 'ancillary')
    result = await page.evaluate(
      (options) => window.simulationWorkerBench.ancillary(options),
      job.options,
    );
  else if (job.mode === 'payloads')
    result = await page.evaluate(
      (options) => window.simulationWorkerBench.payloadSizes(options),
      job.options,
    );
  else if (job.mode === 'profile') {
    const main = await page.context().newCDPSession(page);
    const contexts: ProfilingContext[] = [pageProfilingContext(main)];

    async function attachWorker(): Promise<ProfilingContext> {
      const targets = await root.send('Target.getTargets');
      const target = targets.targetInfos.find(
        (t) => t.type === 'worker' && t.url.includes('/assets/'),
      );
      if (!target) throw new Error('Worker target unavailable for memory attribution');
      const { sessionId } = await root.send('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: false,
      });
      let sequence = 0;
      const pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
      >();
      const listeners = new Map<
        string,
        Set<(event: Protocol.HeapProfiler.addHeapSnapshotChunkPayload) => void>
      >();
      root.on('Target.receivedMessageFromTarget', (event) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message) as {
          id?: number;
          method: string;
          error?: unknown;
          result?: unknown;
          params: Protocol.HeapProfiler.addHeapSnapshotChunkPayload;
        };
        if (message.id) {
          const action = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) action?.reject(new Error(JSON.stringify(message.error)));
          else action?.resolve(message.result ?? {});
        } else for (const handler of listeners.get(message.method) ?? []) handler(message.params);
      });
      return {
        name: 'worker',
        send: <M extends keyof Protocol.CommandParameters>(
          method: M,
          params?: Protocol.CommandParameters[M],
        ) =>
          new Promise<Protocol.CommandReturnValues[M]>((resolve, reject) => {
            const id = ++sequence;
            pending.set(id, {
              resolve: (value) => resolve(value as Protocol.CommandReturnValues[M]),
              reject,
            });
            root
              .send('Target.sendMessageToTarget', {
                sessionId,
                message: JSON.stringify({ id, method, params }),
              })
              .catch(reject);
          }),
        on: (name, handler) => {
          const set = listeners.get(name) ?? new Set();
          set.add(handler);
          listeners.set(name, set);
        },
        off: (name, handler) => listeners.get(name)?.delete(handler),
      };
    }

    async function memory() {
      const value: Record<
        string,
        Protocol.Runtime.getHeapUsageReturnValue | { unavailable: string }
      > = {};
      // Main GC may release wrappers before worker collection. Every context is explicit.
      for (const context of contexts) {
        try {
          await context.send('HeapProfiler.collectGarbage');
          value[context.name] = await context.send('Runtime.getHeapUsage');
        } catch (error) {
          value[context.name] = { unavailable: String(error) };
        }
      }
      return value;
    }

    const checkpoints: Record<
      string,
      | Awaited<ReturnType<typeof memory>>
      | { main: Protocol.Runtime.getHeapUsageReturnValue; workerTargets: number }
    > = { beforeInitialize: await memory() };
    await page.evaluate((options) => window.simulationWorkerBench.initialize(options), job.options);
    if (job.options.execution === 'worker') contexts.push(await attachWorker());
    checkpoints.populated = await memory();
    for (const context of contexts) {
      await context.send('Profiler.enable');
      await context.send('Profiler.start');
    }
    await page.evaluate((count) => window.simulationWorkerBench.ticks(count), job.cpuTicks ?? 200);
    const artifacts = [];
    for (const context of contexts) {
      let profile: Protocol.Profiler.stopReturnValue | null = await context.send('Profiler.stop');
      const file = job.output + `.${context.name}.cpuprofile`;
      await fs.writeFile(file, JSON.stringify(profile.profile));
      profile = null;
      artifacts.push(path.basename(file));
      await context.send('HeapProfiler.enable');
      await context.send('HeapProfiler.startSampling', {
        samplingInterval: 32768,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      });
    }
    await root.send('Tracing.start', {
      categories: 'v8,v8.gc,devtools.timeline,blink.user_timing',
      transferMode: 'ReturnAsStream',
    });
    const soak = [];
    const soakTicks = job.soakTicks ?? 10000;
    for (let tick = 0; tick < soakTicks; tick += 500) {
      const count = Math.min(500, soakTicks - tick);
      await page.evaluate((count) => window.simulationWorkerBench.ticks(count), count);
      const entry = { tick: tick + count, memory: await memory() };
      soak.push(entry);
      await fs.writeFile(
        job.output + '.progress.json',
        JSON.stringify({ phase: 'soak', tick: tick + count }),
      );
    }
    const tracingComplete = new Promise<Protocol.Tracing.tracingCompletePayload>((resolve) =>
      root.once('Tracing.tracingComplete', resolve),
    );
    await root.send('Tracing.end');
    const { stream } = await tracingComplete;
    const traceFile = job.output + '.gc-trace.json';
    const traceHandle = await fs.open(traceFile, 'w');
    while (true) {
      const chunk = await root.send('IO.read', { handle: stream! });
      await traceHandle.write(chunk.data);
      if (chunk.eof) break;
    }
    await traceHandle.close();
    await root.send('IO.close', { handle: stream! });
    artifacts.push(path.basename(traceFile));
    for (const context of contexts) {
      let allocation: Protocol.HeapProfiler.stopSamplingReturnValue | null = await context.send(
        'HeapProfiler.stopSampling',
      );
      const file = job.output + `.${context.name}.heapprofile`;
      await fs.writeFile(file, JSON.stringify(allocation.profile));
      allocation = null;
      artifacts.push(path.basename(file));
    }
    checkpoints.steady = await memory();

    async function snapshot(context: ProfilingContext, suffix: string) {
      const file = job.output + `.${context.name}.${suffix}.heapsnapshot`;
      const handle = await fs.open(file, 'w');
      let writes = Promise.resolve();

      const chunk = ({ chunk }: Protocol.HeapProfiler.addHeapSnapshotChunkPayload) => {
        writes = writes.then(async () => {
          await handle.write(chunk);
        });
      };

      context.on('HeapProfiler.addHeapSnapshotChunk', chunk);
      await context.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      await writes;
      await handle.close();
      context.off('HeapProfiler.addHeapSnapshotChunk', chunk);
      artifacts.push(path.basename(file));
    }

    for (const context of contexts) await snapshot(context, 'steady');
    await page.evaluate(() => window.simulationWorkerBench.captureHeld());
    checkpoints.captureHeld = await memory();
    await page.evaluate(() => window.simulationWorkerBench.rebuildHeld());
    checkpoints.rebuiltCaptureHeld = await memory();
    await page.evaluate(() => window.simulationWorkerBench.releaseHeld());
    checkpoints.captureReleased = await memory();
    await page.evaluate(() => window.simulationWorkerBench.disposeWorldForProfile());
    checkpoints.worldDisposed = await memory();
    for (const context of contexts) await snapshot(context, 'world-disposed');
    await page.evaluate(() => window.simulationWorkerBench.dispose());
    const lifecycle = [];
    const cycles = job.cycles ?? 20;
    for (let cycle = 0; cycle < cycles; cycle++) {
      await page.evaluate((options) => window.simulationWorkerBench.cycle(options), job.options);
      await main.send('HeapProfiler.collectGarbage');
      // Each cycle creates/terminates a fresh worker. The old profiling session is gone.
      lifecycle.push({
        cycle: cycle + 1,
        main: await main.send('Runtime.getHeapUsage'),
        workerTargets: (await root.send('Target.getTargets')).targetInfos.filter(
          (t) => t.type === 'worker',
        ).length,
      });
      if (cycle % 5 === 4)
        await fs.writeFile(
          job.output + '.progress.json',
          JSON.stringify({ phase: 'lifecycle', cycle: cycle + 1 }),
        );
    }
    await main.send('HeapProfiler.collectGarbage');
    checkpoints.disposed = {
      main: await main.send('Runtime.getHeapUsage'),
      workerTargets: (await root.send('Target.getTargets')).targetInfos.filter(
        (t) => t.type === 'worker',
      ).length,
    };
    await snapshot(contexts[0], 'disposed');
    result = {
      checkpoints,
      soak,
      lifecycle,
      artifacts,
      soakTicks,
      cycles,
      workerTerminationVerified: checkpoints.disposed.workerTargets === 0,
    };
  } else throw new Error(`Unknown job mode ${job.mode}`);
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(
    job.output,
    JSON.stringify({ ...job, status: 'ok', context, engine, launch, loadedMs, result }, null, 2),
  );
} catch (error) {
  await page.screenshot({ path: job.output + '.png' }).catch(() => undefined);
  await fs.writeFile(
    job.output,
    JSON.stringify({ ...job, status: 'error', error: String(error), errors }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
