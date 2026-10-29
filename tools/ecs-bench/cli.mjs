import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { runSignature } from './options.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
// Windows sandboxing can redirect LOCALAPPDATA away from the existing browser cache.
if (process.platform === 'win32' && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const installed = path.join(os.homedir(), 'AppData/Local/ms-playwright');
  if (await fs.stat(installed).catch(() => null)) process.env.PLAYWRIGHT_BROWSERS_PATH = installed;
}
const args = process.argv.slice(2);
const command = args[0] ?? 'smoke';
const profilesOnly = args.includes('--profiles-only');
if (profilesOnly && command !== 'full') throw new Error('--profiles-only requires full');
if (args.includes('--help')) {
  console.log(
    'Usage: node tools/ecs-bench/cli.mjs <check|smoke|node|browser|full|report> [--output directory] [--resume]\nDiagnostic filters: --candidates names --scales counts --workloads names --ticks count --repetitions count --profiles; full --profiles-only reruns correctness and target profiles\nReport: --input run-directory --profiles-from diagnostic-directory --destination report-directory; CI: --label hosted-ci',
  );
  process.exit(0);
}
if (!['check', 'smoke', 'node', 'browser', 'full', 'report'].includes(command))
  throw new Error(`Unknown command ${command}; use --help`);
const option = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? fallback : args[i + 1];
};
const primary = ['miniplex', 'bitecs', 'koota', 'becsy'];
const variants = ['bitecs-arrays', 'koota-update', 'becsy-checked'];
const all = ['reference', ...primary, ...variants];
const output = path.resolve(
  root,
  option(
    'output',
    `tmp/ecs-bench/${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${command}`,
  ),
);
await fs.mkdir(output, { recursive: true });

async function fingerprint() {
  const hash = crypto.createHash('sha256');
  async function walk(folder) {
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(ts|mjs|html|json|py|txt)$/.test(file)) {
        hash.update(path.relative(root, file));
        hash.update(await fs.readFile(file));
      }
    }
  }
  await walk(directory);
  hash.update(await fs.readFile(path.join(root, 'yarn.lock')));
  return hash.digest('hex');
}
const manifest = {
  schema: 1,
  command,
  label: option('label', 'reference-desktop'),
  createdAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHash: await fingerprint(),
  lockHash: crypto
    .createHash('sha256')
    .update(await fs.readFile(path.join(root, 'yarn.lock')))
    .digest('hex'),
  runtime: process.versions,
  driverPid: process.pid,
  hardware: {
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    os: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
  },
  packages: {},
  protocol: {
    target: 100000,
    scales: [1000, 10000, 50000, 100000, 250000],
    seed: 1729,
    ticks: 2000,
    repetitions: 5,
    warmupMs: 2000,
    warmupTicks: 200,
    p95GateMs: 5,
    p99GateMs: 8,
    measuredTimeoutMs: 120000,
    forceGcDuringTimings: false,
    observableProjectionConsumer: true,
    exactPublicationCounts: true,
    candidateImportPreloaded: true,
    emptyRuntimeCapacityFactor: 2,
    launchFlags: ['--experimental-transform-types', '--expose-gc'],
  },
};
for (const name of [
  'miniplex',
  'bitecs',
  'koota',
  '@lastolivegames/becsy',
  'playwright',
  'vite',
  'typescript',
])
  manifest.packages[name] = JSON.parse(
    await fs.readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
  ).version;
for (const [name, expected] of Object.entries({
  miniplex: '2.0.0',
  bitecs: '0.4.0',
  koota: '0.6.6',
  '@lastolivegames/becsy': '0.16.1',
}))
  if (manifest.packages[name] !== expected) throw new Error(`Expected ${name}@${expected}`);

if (command === 'report') {
  const { report } = await import('./report.mjs');
  await report(
    path.resolve(root, option('input', output)),
    option('destination', undefined),
    option('profiles-from', undefined),
  );
  process.exit(0);
}
if (process.versions.node !== '24.21.0' && !args.includes('--allow-node-version'))
  throw new Error(
    'Benchmark requires Node 24.21.0; use --allow-node-version only for non-reference diagnostics',
  );
const existing = await fs
  .readFile(path.join(output, 'manifest.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => null);
if (existing && existing.sourceHash !== manifest.sourceHash)
  throw new Error('Cannot resume results from different benchmark code or lockfile');
if (existing && runSignature(existing.arguments ?? []) !== runSignature(args))
  throw new Error('Cannot resume with different experiment arguments');
if (!existing)
  await fs.writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify({ ...manifest, arguments: args }, null, 2),
  );

let server;
let url;
let browserBuild;
async function browserServer() {
  if (server) return;
  const built = path.join(root, 'tmp/ecs-bench/browser-build');
  browserBuild = await build({
    configFile: false,
    root: directory,
    logLevel: 'error',
    build: {
      outDir: built,
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: true,
      minify: true,
      rollupOptions: { input: path.join(directory, 'browser.html') },
    },
  });
  const chunks = Array.isArray(browserBuild)
    ? browserBuild.flatMap((x) => x.output)
    : browserBuild.output;
  await fs.writeFile(
    path.join(output, 'bundles.json'),
    JSON.stringify(
      chunks
        .filter((x) => x.type === 'chunk')
        .map((x) => ({
          file: x.fileName,
          bytes: Buffer.byteLength(x.code),
          gzipBytes: gzipSync(x.code).length,
          imports: x.imports,
          dynamicImports: x.dynamicImports,
          modules: Object.keys(x.modules).map((m) => path.relative(root, m).replaceAll('\\', '/')),
        })),
      null,
      2,
    ),
  );
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(built, '.' + pathname);
      if (!file.startsWith(built + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await fs.readFile(file);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.html')
            ? 'text/html'
            : 'application/json',
      );
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/browser.html`;
}

let serial = 0;
let failures = 0;
async function job(environment, settings) {
  const name = `${String(serial++).padStart(4, '0')}-${environment}-${settings.mode}-${settings.candidate}-${settings.size ?? 1000}-${settings.workload ?? 'all'}-${settings.repetition ?? 0}`;
  const file = path.join(output, name + '.json');
  if (args.includes('--resume')) {
    const previous = await fs
      .readFile(file, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (previous) {
      if (previous.status !== 'ok') failures++;
      return previous;
    }
  }
  const settingsWithOutput = {
    ...settings,
    environment,
    output: file,
    ...(environment === 'browser' ? { url } : {}),
  };
  console.log(`START ${name}`);
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        '--experimental-transform-types',
        '--expose-gc',
        path.join(directory, environment === 'browser' ? 'browser-worker.mjs' : 'node-worker.mjs'),
        JSON.stringify(settingsWithOutput),
      ],
      {
        cwd: root,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let log = '';
    child.stdout.on('data', (data) => {
      log += data;
    });
    child.stderr.on('data', (data) => {
      log += data;
    });
    const timer = setTimeout(
      () => {
        log += '\nOwned worker exceeded watchdog; terminate its entire process tree.\n';
        try {
          if (process.platform === 'win32')
            execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              stdio: 'ignore',
            });
          else process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill();
        }
      },
      settings.mode === 'profile'
        ? 3600000
        : settings.mode === 'ancillary'
          ? 900000
          : settings.mode === 'check'
            ? 180000
            : settings.mode === 'paced'
              ? settings.durationMs + 60000
              : 180000,
    );
    child.on('error', (error) => {
      log += String(error);
    });
    child.on('close', async (code) => {
      clearTimeout(timer);
      await fs.writeFile(file + '.log', log);
      let value = await fs
        .readFile(file, 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      if (!value) {
        value = {
          ...settingsWithOutput,
          status: 'error',
          error: `Worker exited ${code} or exceeded watchdog`,
          log: log.slice(-5000),
        };
        await fs.writeFile(file, JSON.stringify(value));
      }
      resolve(value);
    });
  });
  const status = result.status === 'ok' ? (result.result?.status ?? 'ok') : result.status;
  console.log(
    `END ${name}: ${status}${result.result?.metrics ? ` p95=${result.result.metrics.combined.p95.toFixed(3)} p99=${result.result.metrics.combined.p99.toFixed(3)}` : ''}`,
  );
  if (result.status !== 'ok') failures++;
  return result;
}

try {
  const typecheck = spawn(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'tools/ecs-bench/tsconfig.json'],
    { cwd: root, windowsHide: true, stdio: 'inherit' },
  );
  if ((await new Promise((resolve) => typecheck.on('close', resolve))) !== 0)
    throw new Error('Strict benchmark typecheck failed');
  const protocol = spawn(
    process.execPath,
    ['--experimental-transform-types', '--test', path.join(directory, 'protocol.test.mjs')],
    { cwd: root, windowsHide: true, stdio: 'inherit' },
  );
  if ((await new Promise((resolve) => protocol.on('close', resolve))) !== 0)
    throw new Error('Benchmark protocol checks failed');
  const environments =
    command === 'node' ? ['node'] : command === 'browser' ? ['browser'] : ['node', 'browser'];
  if (environments.includes('browser')) await browserServer();
  const candidates =
    option('candidates', null)?.split(',') ??
    (command === 'check' ? all : [...primary, 'reference']);
  if (candidates.some((c) => !all.includes(c))) throw new Error('Unknown candidate');
  // Correctness is required in the same execution environment before timing.
  for (const environment of environments)
    for (const candidate of command === 'full' ? all : candidates) {
      const value = await job(environment, { mode: 'check', candidate });
      if (value.status !== 'ok')
        throw new Error(`${candidate} correctness failed in ${environment}`);
    }
  if (command !== 'check') {
    const smoke = command === 'smoke';
    const scales =
      option('scales', null)?.split(',').map(Number) ?? (smoke ? [1000] : manifest.protocol.scales);
    const repetitions = profilesOnly ? 0 : Number(option('repetitions', smoke ? 1 : 5));
    const workloads = option('workloads', smoke ? 'mixed' : 'mixed,idle,active,churn').split(',');
    for (let repetition = 0; repetition < repetitions; repetition++)
      for (const environment of environments)
        for (const size of scales)
          for (const workload of workloads) {
            const shift = (repetition + 1729) % candidates.length;
            const ordered = [...candidates.slice(shift), ...candidates.slice(0, shift)];
            for (const candidate of ordered)
              await job(environment, {
                mode: 'trial',
                candidate,
                size,
                workload,
                seed: 1729,
                repetition,
                ticks: Number(option('ticks', smoke ? 50 : 2000)),
                warmupMs: smoke ? 20 : 2000,
                warmupTicks: smoke ? 10 : 200,
              });
          }
    if (smoke && args.includes('--profiles')) {
      for (const environment of environments)
        for (const candidate of candidates.filter((c) => c !== 'reference')) {
          await job(environment, { mode: 'ancillary', candidate, size: 1000, count: 1 });
          await job(environment, {
            mode: 'profile',
            candidate,
            size: 1000,
            soakTicks: 20,
            cpuTicks: 20,
            cycles: 2,
          });
          if (environment === 'browser')
            await job(environment, {
              mode: 'paced',
              candidate,
              size: 1000,
              workload: 'mixed',
              durationMs: 1000,
            });
        }
    }
    if (command === 'full') {
      for (const environment of environments) {
        for (const candidate of profilesOnly ? [] : variants)
          for (let repetition = 0; repetition < 5; repetition++)
            for (const workload of ['mixed', 'idle', 'active', 'churn'])
              await job(environment, {
                mode: 'trial',
                candidate,
                size: 100000,
                workload,
                seed: 1729,
                repetition,
                ticks: 2000,
                warmupMs: 2000,
                warmupTicks: 200,
              });
        for (const candidate of primary) {
          if (!profilesOnly)
            await job(environment, { mode: 'ancillary', candidate, size: 100000, count: 10 });
          await job(environment, {
            mode: 'profile',
            candidate,
            size: 100000,
            soakTicks: 10000,
            cycles: 20,
          });
        }
      }
      for (const candidate of profilesOnly ? [] : primary)
        for (const workload of ['mixed', 'idle', 'active'])
          for (let repetition = 0; repetition < 3; repetition++)
            await job('browser', {
              mode: 'paced',
              candidate,
              workload,
              size: 100000,
              durationMs: 30000,
              repetition,
            });
    }
  }
  const { report } = await import('./report.mjs');
  await report(output);
  await fs.writeFile(
    path.join(output, 'completion.json'),
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        jobs: serial,
        failures,
        sourceHash: manifest.sourceHash,
      },
      null,
      2,
    ),
  );
  console.log(`Results: ${output}`);
  if (failures) process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
