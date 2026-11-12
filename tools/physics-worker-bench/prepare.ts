import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { instrument } from './instrument.ts';
import { extractVariant } from './variants.ts';
import { PROTOCOL, requireLocal } from './protocol.ts';

export const root = path.resolve(import.meta.dirname, '../..');
export const toolRoot = path.join(root, 'tools/physics-worker-bench');
export const reportRoot = path.join(root, 'docs/reports/split-physics-worker/2026-11-10');
export const digest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
export const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export async function fileManifest(
  directory: string,
): Promise<{ path: string; bytes: number; sha256: string }[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory())
        return (await fileManifest(file)).map((row) => ({
          ...row,
          path: entry.name + '/' + row.path,
        }));
      assert(entry.isFile(), `Unexpected non-file in artifact: ${file}`);
      const bytes = await fs.readFile(file);
      return [{ path: entry.name, bytes: bytes.length, sha256: digest(bytes) }];
    }),
  );
  return lists.flat().sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

export async function runNode(args: string[], cwd = root): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Node command exited ${code}: ${args.join(' ')}`)),
    );
  });
}

/** Angular emits the nested bootstrap but leaves this URL in the simulation-worker bundle unresolved. */
export async function fixNestedWorkerUrl(artifact: string): Promise<void> {
  const stats = JSON.parse(await fs.readFile(path.join(artifact, 'browser-stats.json'), 'utf8')) as { outputs: Record<string, { entryPoint?: string }> };
  const native = Object.entries(stats.outputs).find(([, value]) => value.entryPoint?.endsWith('/physics-experiment/physics.worker.ts'))?.[0];
  assert(native, 'Missing emitted native physics worker');
  let replacements = 0;
  const directory = path.join(artifact, 'browser');
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith('.js')) continue;
    const file = path.join(directory, name);
    const source = await fs.readFile(file, 'utf8');
    const anchor = 'new URL("./physics.worker",import.meta.url)';
    if (!source.includes(anchor)) continue;
    replacements += source.split(anchor).length - 1;
    await fs.writeFile(file, source.replaceAll(anchor, `new URL("./${native}",import.meta.url)`));
  }
  assert.equal(replacements, 1, 'Nested physics worker URL changed; inspect the packaging boundary');
}

export interface Preparation {
  version: number;
  id: string;
  preparedAt: string;
  execution: 'held';
  baseCommit: string;
  project: string;
  artifact: string;
  variants: Record<string, { project: string; artifact: string; manifestSha256: string }>;
  artifactManifestSha256: string;
  toolManifestSha256: string;
  originalB0: string;
  originalB0ManifestSha256: string;
  protocolSha256: string;
  requiredNextGate: string;
}

/** Build only. No browser, input injection, simulation replay, sweep or soak is started here. */
export async function prepare(): Promise<Preparation> {
  requireLocal();
  const setup = JSON.parse(await fs.readFile(path.join(reportRoot, 'setup.json'), 'utf8')) as {
    baseCommit: string;
    b0Build: { artifact: string; manifest: string; manifestSha256: string };
  };
  assert.equal(
    git('rev-parse', 'HEAD'),
    setup.baseCommit,
    'B0 commit changed; establish a new explicit reference.',
  );
  assert.equal(
    git(
      'diff',
      'HEAD',
      '--',
      'src',
      'assets',
      'public',
      'package.json',
      'yarn.lock',
      'angular.json',
    ),
    '',
    'Production sources changed; freeze a new B0 before preparation.',
  );
  const originalManifest = await fs.readFile(path.join(root, setup.b0Build.manifest));
  assert.equal(
    digest(originalManifest),
    setup.b0Build.manifestSha256,
    'Frozen B0 manifest changed.',
  );
  const originalFiles = (
    JSON.parse(originalManifest.toString()) as { files: { path: string; sha256: string }[] }
  ).files;
  for (const file of originalFiles)
    assert.equal(
      digest(await fs.readFile(path.join(root, file.path))),
      file.sha256,
      `Frozen B0 artifact changed: ${file.path}`,
    );
  const id = randomUUID().slice(0, 8);
  const project = path.join(root, 'tmp/physics-worker-bench', id, 'b0-project');
  const artifact = path.join(root, 'dist/physics-worker-bench', id, 'b0-instrumented');
  await fs.mkdir(project, { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(project, 'src'), { recursive: true });
  for (const name of [
    'angular.json',
    'package.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.worker.json',
  ])
    await fs.copyFile(path.join(root, name), path.join(project, name));
  // Read-only build inputs and installed dependencies are shared; sources/output/caches are isolated.
  await fs.symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'junction');
  await fs.symlink(path.join(root, 'public'), path.join(project, 'public'), 'junction');
  await instrument(project, toolRoot);
  await runNode(
    [
      path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
      'build',
      '--configuration',
      'production',
      '--stats-json',
      '--output-path',
      artifact,
    ],
    project,
  );
  const manifest = await fileManifest(path.join(artifact, 'browser'));
  const variants: Preparation['variants'] = {
    B0: { project, artifact, manifestSha256: digest(JSON.stringify(manifest)) },
  };
  const variantManifests: Record<string, unknown> = { B0: manifest };
  for (const variant of ['B1', 'C1'] as const) {
    const candidateProject = path.join(
      root,
      'tmp/physics-worker-bench',
      id,
      variant.toLowerCase() + '-project',
    );
    await fs.mkdir(candidateProject, { recursive: true });
    await fs.cp(path.join(project, 'src'), path.join(candidateProject, 'src'), { recursive: true });
    for (const name of [
      'angular.json',
      'package.json',
      'tsconfig.json',
      'tsconfig.app.json',
      'tsconfig.worker.json',
    ])
      await fs.copyFile(path.join(root, name), path.join(candidateProject, name));
    await fs.symlink(
      path.join(root, 'node_modules'),
      path.join(candidateProject, 'node_modules'),
      'junction',
    );
    await fs.symlink(path.join(root, 'public'), path.join(candidateProject, 'public'), 'junction');
    await extractVariant(candidateProject, toolRoot, variant);
    const candidateArtifact = path.join(
      root,
      'dist/physics-worker-bench',
      id,
      variant.toLowerCase(),
    );
    await runNode(
      [
        path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
        'build',
        '--configuration',
        'production',
        '--stats-json',
        '--output-path',
        candidateArtifact,
      ],
      candidateProject,
    );
    if (variant === 'C1') await fixNestedWorkerUrl(candidateArtifact);
    const candidateManifest = await fileManifest(path.join(candidateArtifact, 'browser'));
    variants[variant] = {
      project: candidateProject,
      artifact: candidateArtifact,
      manifestSha256: digest(JSON.stringify(candidateManifest)),
    };
    variantManifests[variant] = candidateManifest;
  }
  const tools = await fileManifest(toolRoot);
  const preparation: Preparation = {
    version: 1,
    id,
    preparedAt: new Date().toISOString(),
    execution: 'held',
    baseCommit: setup.baseCommit,
    project,
    artifact,
    variants,
    artifactManifestSha256: digest(JSON.stringify(manifest)),
    toolManifestSha256: digest(JSON.stringify(tools)),
    originalB0: path.join(root, setup.b0Build.artifact),
    originalB0ManifestSha256: setup.b0Build.manifestSha256,
    protocolSha256: digest(JSON.stringify(PROTOCOL)),
    requiredNextGate:
      'User release, then causal probe validation and baseline. B1/C1 ranking remains gated on baseline and correctness.',
  };
  await fs.mkdir(reportRoot, { recursive: true });
  await fs.writeFile(
    path.join(reportRoot, `prepared-${id}-files.json`),
    JSON.stringify({ variants: variantManifests, tools }, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(reportRoot, 'protocol.json'),
    JSON.stringify(PROTOCOL, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(reportRoot, 'preparation.json'),
    JSON.stringify(preparation, null, 2) + '\n',
  );
  await fs.writeFile(path.join(reportRoot, `preparation-${id}.json`), JSON.stringify(preparation, null, 2) + '\n');
  await fs.writeFile(
    path.join(reportRoot, 'device.json'),
    JSON.stringify(
      {
        supplied: PROTOCOL.hardware,
        observedDuringPreparation: {
          cpu: os.cpus()[0]?.model,
          logicalProcessors: os.cpus().length,
          totalMemoryBytes: os.totalmem(),
          os: `${os.type()} ${os.release()}`,
          node: process.version,
        },
        displayModeVerified: false,
        browserCadenceMeasured: false,
      },
      null,
      2,
    ) + '\n',
  );
  await fs.writeFile(
    path.join(reportRoot, 'stages.json'),
    JSON.stringify(
      {
        execution: 'held-for-user-release',
        stages: PROTOCOL.stages.map((stage) => ({ stage, status: 'not-started' })),
        unavailable: ['physical-input-to-photon', 'human-AB', 'other-hardware-qualification'],
      },
      null,
      2,
    ) + '\n',
  );
  return preparation;
}
