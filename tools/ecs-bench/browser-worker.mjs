import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const job = JSON.parse(process.argv[2]);
const start = performance.now();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(job.url);
  await page.waitForFunction(() => !!window.ecsLaboratory);
  const cdp = await page.context().newCDPSession(page);
  const collect = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return cdp.send('Runtime.getHeapUsage');
  };
  let result;
  if (job.mode === 'check')
    result = await page.evaluate(
      (candidate) => window.ecsLaboratory.check(candidate),
      job.candidate,
    );
  else if (job.mode === 'trial')
    result = await page.evaluate((options) => window.ecsLaboratory.trial(options), job);
  else if (job.mode === 'ancillary')
    result = await page.evaluate(
      (o) => window.ecsLaboratory.ancillary(o.candidate, o.size, o.count),
      job,
    );
  else if (job.mode === 'paced')
    result = await page.evaluate(
      (o) => window.ecsLaboratory.paced(o.candidate, o.size, o.workload, o.durationMs),
      job,
    );
  else if (job.mode === 'profile') {
    result = { checkpoints: { beforeImport: await collect() }, cycles: [], unavailable: [] };
    result.importMs = await page.evaluate((c) => window.ecsLaboratory.preload(c), job.candidate);
    result.checkpoints.afterImport = await collect();
    await page.evaluate(
      (o) => window.ecsLaboratory.create(o.candidate, 0, 'churn', o.size * 2),
      job,
    );
    result.checkpoints.emptyRuntime = await collect();
    await page.evaluate(() => window.ecsLaboratory.dispose());
    result.checkpoints.afterEmptyDisposed = await collect();
    await page.evaluate((o) => window.ecsLaboratory.create(o.candidate, o.size), job);
    result.checkpoints.populated = await collect();
    await page.evaluate(() => window.ecsLaboratory.instrumentDirty(true));
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await page.evaluate((n) => window.ecsLaboratory.ticks(n), job.cpuTicks ?? 200);
    const cpu = await cdp.send('Profiler.stop');
    await fs.writeFile(job.output + '.cpuprofile', JSON.stringify(cpu.profile));
    result.cpuProfile = path.basename(job.output + '.cpuprofile');
    await cdp.send('HeapProfiler.enable');
    let sampling = true;
    try {
      await cdp.send('HeapProfiler.startSampling', {
        samplingInterval: 32768,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      });
    } catch (error) {
      sampling = false;
      result.unavailable.push({ metric: 'allocation sampling', error: String(error) });
    }
    const ticks = job.soakTicks ?? 10000;
    let tracing = true;
    try {
      await cdp.send('Tracing.start', { categories: 'v8', transferMode: 'ReturnAsStream' });
    } catch (error) {
      tracing = false;
      result.unavailable.push({ metric: 'GC tracing', error: String(error) });
    }
    for (let tick = 0; tick < ticks; tick += 1000) {
      await page.evaluate((n) => window.ecsLaboratory.ticks(n), Math.min(1000, ticks - tick));
      result.checkpoints[`soak-${tick}`] = await cdp.send('Runtime.getHeapUsage');
      await fs.writeFile(job.output + '.progress.json', JSON.stringify({ phase: 'soak', tick }));
    }
    if (sampling) {
      const allocations = await cdp.send('HeapProfiler.stopSampling');
      await fs.writeFile(job.output + '.heapprofile', JSON.stringify(allocations.profile));
      result.allocationProfile = path.basename(job.output + '.heapprofile');
    }
    if (tracing) {
      const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const trace = await complete;
      const tracePath = job.output + '.trace.json';
      const file = await fs.open(tracePath, 'w');
      try {
        let eof = false;
        while (!eof) {
          const part = await cdp.send('IO.read', { handle: trace.stream, size: 524288 });
          await file.write(part.base64Encoded ? Buffer.from(part.data, 'base64') : part.data);
          eof = part.eof;
        }
      } finally {
        await file.close();
        await cdp.send('IO.close', { handle: trace.stream });
      }
      result.gcTrace = path.basename(tracePath);
    }
    await page.evaluate(() => window.ecsLaboratory.releaseProjection());
    result.checkpoints.steady = await collect();
    result.dirtyTracking = await page.evaluate(() => window.ecsLaboratory.dirtyDiagnostics());
    const handle = await fs.open(job.output + '.heapsnapshot', 'w');
    let writes = Promise.resolve();
    const chunk = ({ chunk }) => {
      writes = writes.then(() => handle.write(chunk));
    };
    cdp.on('HeapProfiler.addHeapSnapshotChunk', chunk);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    await writes;
    await handle.close();
    cdp.off('HeapProfiler.addHeapSnapshotChunk', chunk);
    result.heapSnapshot = path.basename(job.output + '.heapsnapshot');
    await page.evaluate(() => window.ecsLaboratory.capture());
    result.checkpoints.captureHeld = await collect();
    await page.evaluate((c) => window.ecsLaboratory.rebuild(c), job.candidate);
    result.checkpoints.rebuildHeld = await collect();
    await page.evaluate(() => window.ecsLaboratory.releaseCapture());
    result.checksum = await page.evaluate(() => window.ecsLaboratory.checksum());
    await page.evaluate(() => window.ecsLaboratory.dispose());
    for (let cycle = 0; cycle < (job.cycles ?? 20); cycle++) {
      await page.evaluate((o) => window.ecsLaboratory.cycle(o.candidate, o.size), job);
      result.cycles.push(await collect());
      await fs.writeFile(
        job.output + '.progress.json',
        JSON.stringify({ phase: 'lifecycle', cycle }),
      );
    }
    result.checkpoints.disposed = await collect();
  } else throw new Error(`Unknown browser mode ${job.mode}`);
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(
    job.output,
    JSON.stringify({
      ...job,
      status: 'ok',
      browserVersion: browser.version(),
      result,
      elapsedMs: performance.now() - start,
    }),
  );
} catch (error) {
  await fs.writeFile(
    job.output,
    JSON.stringify({
      ...job,
      status: 'error',
      error: String(error?.stack ?? error),
      elapsedMs: performance.now() - start,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
