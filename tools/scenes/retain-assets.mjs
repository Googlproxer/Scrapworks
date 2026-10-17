import fs from 'node:fs/promises';
import path from 'node:path';
import { filesUnder } from './inventory.mjs';

export function localPath(root, name) {
  if (
    typeof name !== 'string' ||
    !name ||
    /[\\:\0?#]/.test(name) ||
    name.split('/').some((part) => part === '..') ||
    path.posix.isAbsolute(name) ||
    path.posix.normalize(name) !== name
  ) {
    throw new Error(`Expected an export-relative file path: ${name}`);
  }
  const target = path.resolve(root, name);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error(`Export path escapes its root: ${name}`);
  return target;
}

export async function retainSceneAssets(output, policy) {
  if (policy.version !== 1 || !Array.isArray(policy.additionalSceneAssets)) throw new Error('Unsupported export policy');
  // Resolve and validate the generated directory before enumerating or deleting files.
  const root = path.resolve(output);
  if ((await fs.realpath(root)) !== root) throw new Error('Generated export root must not be a symbolic link');
  const used = JSON.parse(await fs.readFile(path.join(root, 'scenes-used-files.json'), 'utf8'));
  if (!Object.keys(used).length) throw new Error('No scene manifests were exported');
  const keep = new Set(policy.additionalSceneAssets);
  for (const [scene, names] of Object.entries(used)) {
    if (!scene.endsWith('.scene') || !Array.isArray(names) || !names.includes(scene.replace(/\.scene$/, '.babylon')))
      throw new Error(`Invalid exported scene manifest: ${scene}`);
    for (const name of names) keep.add(name);
  }
  const files = await filesUnder(root);
  const relativeFiles = files.map((file) => path.relative(root, file).split(path.sep).join('/'));
  // Validate the complete retention set before the first deletion. Metadata-only authoring
  // source paths are not runtime dependencies; the CLI's scene manifest owns that distinction.
  for (const name of keep) {
    const target = localPath(root, name);
    if (!(await fs.stat(target).catch(() => null))?.isFile()) throw new Error(`Required scene asset is absent: ${name}`);
  }
  const retained = relativeFiles.filter((name) => !name.startsWith('assets/') || keep.has(name));
  const removed = [];
  for (const name of relativeFiles.filter((name) => name.startsWith('assets/') && !keep.has(name))) {
    const target = localPath(root, name);
    removed.push({ path: name, bytes: (await fs.stat(target)).size });
    await fs.unlink(target);
  }
  // The upstream assets list includes hypothetical compressed variants. Publish actual files.
  await fs.writeFile(
    path.join(root, 'assets-list.json'),
    JSON.stringify(retained.filter((name) => name !== 'assets-list.json' && name !== 'scenes-used-files.json').sort(), null, 2) + '\n',
  );
  return { retainedFiles: retained.length, removedFiles: removed.length, removedBytes: removed.reduce((sum, file) => sum + file.bytes, 0), removed };
}
