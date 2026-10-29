import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { build } from 'vite';

const directory = import.meta.dirname;
const root = path.resolve(directory, '../..');
const args = process.argv.slice(2);
const command = args[0] ?? 'smoke';
const option = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? fallback : args[i + 1];
};
if (args.includes('--help')) {
  console.log(
    'Simulation worker bench: check | smoke | calibrate | browser | report; --output path --resume --candidates miniplex,bitecs --executions inline,worker --phase all|primary|diagnostics|profiles|paced|followup --repetitions 5 --duration-ms 30000 --destination path --label reference-desktop|hosted-ci',
  );
  process.exit(0);
}
if (command === 'report') {
  const { report } = await import('./report.mjs');
  await report(
    path.resolve(option('input', 'tmp/simulation-worker-bench/latest')),
    option('destination', undefined),
  );
  process.exit(0);
}
if (!['check', 'smoke', 'calibrate', 'browser'].includes(command))
  throw new Error('Unknown command');
if (process.versions.node !== '24.21.0') throw new Error('Use Node 24.21.0');
if (command === 'check' || command === 'smoke') {
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      path.join(directory, 'tsconfig.json'),
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  execFileSync(
    process.execPath,
    ['--experimental-transform-types', '--test', path.join(directory, 'protocol.test.mjs')],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
}
const output = path.resolve(
  option(
    'output',
    `tmp/simulation-worker-bench/${new Date().toISOString().replaceAll(':', '-')}-${command}`,
  ),
);
await fs.mkdir(output, { recursive: true });
async function fingerprint() {
  const hashes = {};
  for (const folder of [
    'tools/simulation-worker-bench',
    'tools/ecs-bench',
    'src/simulation',
    'src/core',
    'src/contracts',
  ]) {
    const walk = async (directory) => {
      for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (/\.(ts|mjs|json|html|py|txt)$/.test(file))
          hashes[path.relative(root, file).replaceAll('\\', '/')] = crypto
            .createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex');
      }
    };
    await walk(path.join(root, folder));
  }
  for (const file of ['yarn.lock', 'package.json'])
    hashes[file] = crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(root, file)))
      .digest('hex');
  return {
    files: hashes,
    hash: crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  };
}
const source = await fingerprint();
const manifest = {
  schema: 1,
  command,
  arguments: args,
  label: option('label', 'reference-desktop'),
  createdAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim(),
  source,
  node: process.versions,
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
    seed: 1729,
    stepMs: 50,
    catchupSteps: 5,
    ticks: 2000,
    warmupMs: 2000,
    warmupTicks: 200,
    repetitions: 5,
    timeoutMs: 120000,
    gates: {
      workerP95: 5,
      workerP99: 8,
      hostApplyP95: 2,
      hostApplyP99: 4,
      frameP95: 18.5,
      frameP99: 33.4,
      inputP95: 100,
      inputP99: 150,
    },
    frameTarget: 60,
    hz120: 'emulated diagnostic only',
    sharedMemoryImplemented: false,
    simulationWorkersPerWorld: 1,
    outstandingBatches: 1,
    primaryWire: 'object',
  },
};
manifest.qualification = JSON.parse(
  await fs.readFile(path.join(directory, 'qualification.json'), 'utf8'),
);
manifest.protocol.gates = manifest.qualification.gates;
for (const name of ['miniplex', 'bitecs', 'playwright', 'vite', 'typescript'])
  manifest.packages[name] = JSON.parse(
    await fs.readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
  ).version;
if (manifest.packages.miniplex !== '2.0.0' || manifest.packages.bitecs !== '0.4.0')
  throw new Error('Candidate versions changed');
const previous = await fs
  .readFile(path.join(output, 'manifest.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => null);
if (previous && (!args.includes('--resume') || previous.source.hash !== source.hash))
  throw new Error('Existing output requires --resume with identical source');
const signature = (values) =>
  values.filter((v, i) => v !== '--resume' && values[i - 1] !== '--output' && v !== '--output');
if (previous && JSON.stringify(signature(previous.arguments)) !== JSON.stringify(signature(args)))
  throw new Error('Experiment arguments changed');
if (!previous)
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
const built = path.join(output, 'build');
await build({
  configFile: false,
  root: directory,
  base: '/lab/',
  logLevel: 'error',
  resolve: {
    alias: {
      '@contracts': path.join(root, 'src/contracts'),
      '@core': path.join(root, 'src/core'),
      '@simulation': path.join(root, 'src/simulation'),
    },
  },
  worker: { format: 'es' },
  build: {
    outDir: built,
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    sourcemap: true,
    rollupOptions: { input: path.join(directory, 'browser.html') },
  },
});
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/lab/')) {
      response.writeHead(404).end();
      return;
    }
    const file = path.resolve(built, '.' + decodeURIComponent(url.pathname.slice(4)));
    if (!file.startsWith(built + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader(
      'Content-Type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'text/javascript'
          : 'application/json',
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:",
    );
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/lab/browser.html`;
const candidates = option('candidates', 'miniplex,bitecs').split(',');
const executions = option('executions', 'inline,worker').split(',');
for (const c of candidates)
  if (!['miniplex', 'bitecs'].includes(c)) throw new Error('Unknown candidate');
for (const e of executions)
  if (!['inline', 'worker'].includes(e)) throw new Error('Unknown execution');
const configurations = candidates.flatMap((candidate) =>
  executions.map((execution) => ({ candidate, execution })),
);
const smoke = command === 'smoke';
const calibration = command === 'calibrate';
const phase = option('phase', 'all');
if (!['all', 'primary', 'diagnostics', 'profiles', 'paced', 'followup'].includes(phase))
  throw new Error('Unknown phase');
const jobs = [];
const base = { size: 100000, seed: 1729, workload: 'mixed', clock: 'host', wire: 'object' };
for (const config of configurations)
  jobs.push({ mode: 'check', options: { ...base, ...config, size: 1000 } });
if (command !== 'check') {
  const reps = Number(option('repetitions', smoke || calibration ? 1 : 5));
  if (phase === 'all' || phase === 'primary' || phase === 'followup') {
    const cases = smoke
      ? [{ size: 1000, workload: 'mixed' }]
      : calibration
        ? [1000, 10000, 100000].map((size) => ({ size, workload: 'mixed' }))
        : [100000, 50000, 250000]
            .map((size) => ({ size, workload: 'mixed' }))
            .concat(['idle', 'active', 'churn'].map((workload) => ({ size: 100000, workload })));
    for (let repetition = 0; repetition < reps; repetition++)
      for (const fixture of cases) {
        const offset = (1729 + repetition) % configurations.length;
        const order = [...configurations.slice(offset), ...configurations.slice(0, offset)];
        for (const config of order)
          jobs.push({
            mode: 'trial',
            repetition,
            options: {
              ...base,
              ...fixture,
              ...config,
              ...(smoke || calibration
                ? { ticks: calibration ? 100 : 20, warmupTicks: 20, warmupMs: 100 }
                : {}),
            },
          });
      }
  }
  if (!smoke && !calibration && ['all', 'diagnostics'].includes(phase))
    for (const config of configurations) {
      jobs.push({ mode: 'ancillary', options: { ...base, ...config } });
      for (const variant of [{ batch: 5 }, { batch: 5, yielding: true }, { wire: 'json-buffer' }])
        jobs.push({ mode: 'trial', diagnostic: true, options: { ...base, ...config, ...variant } });
    }
  if (!smoke && !calibration && ['all', 'diagnostics', 'followup'].includes(phase))
    for (const config of configurations)
      jobs.push({ mode: 'payloads', diagnostic: true, options: { ...base, ...config } });
  if (!smoke && !calibration && ['all', 'profiles'].includes(phase))
    for (const config of configurations)
      jobs.push({ mode: 'profile', options: { ...base, ...config, workload: 'churn' } });
  if (smoke && args.includes('--profiles'))
    for (const config of configurations)
      jobs.push({
        mode: 'profile',
        soakTicks: 100,
        cycles: 2,
        cpuTicks: 20,
        options: { ...base, ...config, size: 1000, workload: 'churn' },
      });
  if (smoke && args.includes('--paced')) {
    for (const config of configurations)
      jobs.push({
        mode: 'paced',
        options: {
          ...base,
          ...config,
          size: 1000,
          durationMs: 1000,
          pressureMs: 4,
          warmupTicks: 20,
          warmupMs: 100,
        },
      });
    for (const config of configurations.filter((c) => c.execution === 'worker'))
      jobs.push({
        mode: 'paced',
        diagnostic: true,
        options: {
          ...base,
          ...config,
          size: 1000,
          durationMs: 1000,
          pressureMs: 4,
          clock: 'worker',
          warmupTicks: 20,
          warmupMs: 100,
        },
      });
  }
  if (!smoke && !calibration && ['all', 'paced', 'followup'].includes(phase)) {
    const durationMs = Number(option('duration-ms', 30000));
    for (const config of configurations)
      for (const workload of ['mixed', 'idle', 'active'])
        for (const pressureMs of [0, 4, 8])
          for (let repetition = 0; repetition < 3; repetition++)
            jobs.push({
              mode: 'paced',
              repetition,
              options: { ...base, ...config, workload, pressureMs, durationMs },
            });
    for (const config of configurations)
      jobs.push({
        mode: 'paced',
        diagnostic: true,
        options: { ...base, ...config, hz: 120, pressureMs: 4, durationMs },
      });
    const clockCases = configurations
      .filter((c) => c.execution === 'worker')
      .flatMap((config) => ['host', 'worker'].map((clock) => ({ ...config, clock })));
    for (let repetition = 0; repetition < 3; repetition++) {
      const offset = (1729 + repetition) % clockCases.length;
      const order = [...clockCases.slice(offset), ...clockCases.slice(0, offset)];
      for (const config of order)
        jobs.push({
          mode: 'paced',
          diagnostic: true,
          repetition,
          options: { ...base, ...config, pressureMs: 8, durationMs },
        });
    }
  }
}
await fs.writeFile(path.join(output, 'matrix.json'), JSON.stringify(jobs, null, 2));
let failures = 0;
const started = performance.now();
try {
  for (const [index, job] of jobs.entries()) {
    const name = `${String(index).padStart(4, '0')}-${job.mode}-${job.options.candidate}-${job.options.execution}-${job.options.size}-${job.options.workload}`;
    const file = path.join(output, name + '.json');
    if (args.includes('--resume') && (await fs.stat(file).catch(() => false))) {
      const old = JSON.parse(await fs.readFile(file, 'utf8'));
      if (old.status !== 'ok') failures++;
      continue;
    }
    console.log(`START ${index + 1}/${jobs.length} ${name}`);
    await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [path.join(directory, 'runner.mjs'), JSON.stringify({ ...job, url, output: file })],
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
      const timeout = setTimeout(
        () => {
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
        job.mode === 'profile'
          ? 3600000
          : job.mode === 'ancillary'
            ? 900000
            : job.mode === 'paced'
              ? job.options.durationMs + 120000
              : 300000,
      );
      child.on('close', async (code) => {
        clearTimeout(timeout);
        await fs.writeFile(file + '.log', log);
        if (!(await fs.stat(file).catch(() => false)))
          await fs.writeFile(
            file,
            JSON.stringify({
              ...job,
              status: 'error',
              error: `Runner exited ${code}`,
              log: log.slice(-4000),
            }),
          );
        resolve();
      });
    });
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value.status !== 'ok') failures++;
    await fs.writeFile(
      path.join(output, 'progress.json'),
      JSON.stringify({
        completed: index + 1,
        total: jobs.length,
        failures,
        last: name,
        elapsedMs: performance.now() - started,
        updatedAt: new Date().toISOString(),
      }),
    );
    console.log(
      `END ${name}: ${value.status}${value.result?.statistics?.roundTrip ? ` p95=${value.result.statistics.roundTrip.p95.toFixed(3)}` : ''}${value.error ? ' ' + value.error : ''}`,
    );
    if (value.status !== 'ok' && job.mode === 'check')
      throw new Error('Correctness failure prevents measurement');
  }
  await fs.writeFile(
    path.join(output, 'completion.json'),
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        jobs: jobs.length,
        failures,
        elapsedMs: performance.now() - started,
        sourceHash: source.hash,
      },
      null,
      2,
    ),
  );
  console.log(`Results: ${output}`);
  if (failures) process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}
