import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { filesUnder } from './inventory.mjs';
import { localPath, retainSceneAssets } from './retain-assets.mjs';

export function assertNoPhysicsBodies(value, location = 'scene') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['physicsAggregate', 'physicsImpostor', 'physicsBody', 'physicsJoint', 'physicsBodies'].includes(key)) {
      if (child != null && child !== false && child !== 0 && (!Array.isArray(child) || child.length))
        throw new Error(
          `Physics body found at ${location}.${key}. Configure intentional runtime physics before exporting; the no-body workaround cannot handle this scene.`,
        );
    }
    assertNoPhysicsBodies(child, `${location}.${key}`);
  }
}

export async function attachedScripts(root) {
  const scripts = new Set();
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    for (const script of value.metadata?.scripts ?? []) {
      if (script.enabled && !script.debugOnly) {
        const target = localPath(path.join(root, 'src'), script.key);
        scripts.add(path.relative(root, target).split(path.sep).join('/'));
      }
    }
    for (const child of Object.values(value)) collect(child);
  }
  for (const file of await filesUnder(path.join(root, 'assets'))) {
    if (!file.endsWith('.json') || !file.split(path.sep).some((part) => part.endsWith('.scene'))) continue;
    collect(JSON.parse(await fs.readFile(file, 'utf8')));
  }
  for (const name of scripts) {
    if (!(await fs.stat(path.join(root, name)).catch(() => null))?.isFile()) throw new Error(`Attached presentation script is missing: ${name}`);
  }
  return scripts;
}

async function runPack(directory, signal) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./pack-worker.mjs', import.meta.url)), directory], { stdio: 'inherit', signal });
    child.once('error', (error) => {
      if (error.name !== 'AbortError') reject(error);
    });
    child.once('exit', (code, reason) => (code === 0 ? resolve() : reject(new Error(`Editor pack failed (${reason ?? code})`))));
  });
}

async function writeIfChanged(file, bytes, temporary) {
  if ((await fs.readFile(file).catch(() => null))?.equals(bytes)) return;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

export async function publishOutput(root, stage, rename = fs.rename) {
  const output = path.join(root, 'public/scene');
  const next = path.join(stage, 'public/scene');
  const previous = path.join(stage, 'previous-scene');
  const registry = path.join(root, 'src/scripts.ts');
  const bytes = await fs.readFile(path.join(stage, 'src/scripts.ts'));
  // Validate absolute paths before moving any directory. Stages are workspace-local.
  if (path.dirname(stage) !== path.join(root, 'tmp/scene-export') || !path.basename(stage).startsWith('run-')) throw new Error('Invalid export stage');
  for (const directory of ['public', 'src']) {
    if ((await fs.realpath(path.join(root, directory))) !== path.join(root, directory)) throw new Error(`${directory} cannot be a symbolic link`);
  }
  if ((await fs.lstat(output).catch(() => null))?.isSymbolicLink()) throw new Error('Scene output cannot be a symbolic link');
  const originalFiles = await filesUnder(output);
  const nextFiles = await filesUnder(next);
  const oldNames = new Set(originalFiles.map((file) => path.relative(output, file).split(path.sep).join('/')));
  const newNames = new Set(nextFiles.map((file) => path.relative(next, file).split(path.sep).join('/')));
  if (originalFiles.length) await fs.cp(output, previous, { recursive: true });
  try {
    // Preserve Angular's watched directories. Replacing the whole directory
    // detaches its file watchers on Windows, so subsequent saves never reload.
    // Dependencies go first; serialized scene entry points go last.
    nextFiles.sort((left, right) => Number(left.endsWith('.babylon')) - Number(right.endsWith('.babylon')));
    for (const file of nextFiles) {
      const name = path.relative(next, file).split(path.sep).join('/');
      const target = localPath(output, name);
      const bytes = await fs.readFile(file);
      if ((await fs.readFile(target).catch(() => null))?.equals(bytes)) continue;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await rename(file, target);
    }
    for (const name of oldNames) if (!newNames.has(name)) await fs.unlink(localPath(output, name));
    await writeIfChanged(registry, bytes, path.join(stage, 'next-scripts.ts'));
  } catch (error) {
    try {
      for (const name of newNames)
        if (!oldNames.has(name))
          await fs.unlink(localPath(output, name)).catch((failure) => {
            if (failure.code !== 'ENOENT') throw failure;
          });
      for (const name of oldNames) {
        const target = localPath(output, name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(localPath(previous, name), target);
      }
    } catch (recovery) {
      const failure = new AggregateError([error, recovery], `Publication recovery failed; preserve and inspect ${stage}`);
      failure.preserveStage = true;
      throw failure;
    }
    throw error;
  }
}

export class SupersededExport extends Error {}

export async function exportProject(projectRoot, { packProject = runPack, signal, isCurrent = () => true } = {}) {
  const root = await fs.realpath(projectRoot);
  const temporary = path.join(root, 'tmp');
  await fs.mkdir(temporary, { recursive: true });
  if ((await fs.realpath(temporary)) !== temporary) throw new Error('Export temporary directory cannot be a symbolic link');
  const lockPath = path.join(temporary, 'scene-export.lock');
  let lock;
  try {
    lock = await fs.open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(`Another export owns ${lockPath}. If it crashed, verify its recorded PID has stopped before removing that lock file.`);
    throw error;
  }
  let stage;
  let preserveStage = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    const stages = path.join(temporary, 'scene-export');
    await fs.mkdir(stages, { recursive: true });
    if ((await fs.realpath(stages)) !== stages) throw new Error('Export stages cannot be a symbolic link');
    stage = await fs.mkdtemp(path.join(stages, 'run-'));
    // Real copies isolate authored inputs from CLI directory/cache mutations.
    for (const directory of ['assets', 'src']) {
      if ((await fs.realpath(path.join(root, directory))) !== path.join(root, directory)) throw new Error(`${directory} cannot be a symbolic link`);
      await filesUnder(path.join(root, directory));
      await fs.cp(path.join(root, directory), path.join(stage, directory), { recursive: true });
    }
    const projects = (await fs.readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.bjseditor'))
      .map((entry) => entry.name);
    if (projects.length !== 1) throw new Error('Expected exactly one Scrapworks .bjseditor project');
    await fs.copyFile(path.join(root, projects[0]), path.join(stage, projects[0]));
    const toolsPackage = new URL('../../package.json', import.meta.resolve('babylonjs-editor-tools'));
    const packageTarget = path.join(stage, 'node_modules/babylonjs-editor-tools/package.json');
    await fs.mkdir(path.dirname(packageTarget), { recursive: true });
    await fs.copyFile(toolsPackage, packageTarget);
    await attachedScripts(stage);
    for (const file of await filesUnder(path.join(stage, 'assets'))) {
      if (file.endsWith('.json') && file.split(path.sep).some((part) => part.endsWith('.scene')))
        assertNoPhysicsBodies(JSON.parse(await fs.readFile(file, 'utf8')), path.relative(stage, file));
    }
    signal?.throwIfAborted();
    await packProject(stage, signal);
    const output = path.join(stage, 'public/scene');
    for (const filename of await fs.readdir(output)) {
      if (!filename.endsWith('.babylon')) continue;
      const target = path.join(output, filename);
      const scene = JSON.parse(await fs.readFile(target, 'utf8'));
      assertNoPhysicsBodies(scene, filename);
      // CLI 5.5.2 sets physicsEnabled even when no bodies exist.
      scene.physicsEnabled = false;
      await fs.writeFile(target, JSON.stringify(scene));
    }
    const policy = JSON.parse(await fs.readFile(path.join(root, 'tools/scenes/export-policy.json'), 'utf8'));
    const report = await retainSceneAssets(output, policy);
    signal?.throwIfAborted();
    if (!isCurrent()) throw new SupersededExport('Authoring changed during export; retrying the latest saved inputs');
    await publishOutput(root, stage);
    const audit = path.join(temporary, 'asset-audit/last-export.json');
    try {
      await fs.mkdir(path.dirname(audit), { recursive: true });
      await fs.writeFile(audit, JSON.stringify(report, null, 2) + '\n');
    } catch (error) {
      console.warn(`Export published; audit report write failed: ${error.message}`);
    }
    return report;
  } catch (error) {
    preserveStage = !!error.preserveStage;
    throw error;
  } finally {
    try {
      if (stage && !preserveStage) {
        const resolved = await fs.realpath(stage);
        if (path.dirname(resolved) !== path.join(root, 'tmp/scene-export') || !path.basename(resolved).startsWith('run-'))
          throw new Error('Unexpected export cleanup path');
        await fs
          .rm(resolved, { recursive: true, maxRetries: 3, retryDelay: 100 })
          .catch((error) => console.warn(`Export stage cleanup failed; retained ${resolved}: ${error.message}`));
      }
    } finally {
      await lock.close();
      await fs.unlink(lockPath);
    }
  }
}
