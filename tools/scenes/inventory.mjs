import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function filesUnder(directory) {
  if (!(await fs.stat(directory).catch(() => null))?.isDirectory()) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link requires explicit review: ${target}`);
      return entry.isDirectory() ? filesUnder(target) : [target];
    }),
  );
  return nested.flat().sort();
}

export const relative = (file) => path.relative(projectRoot, file).split(path.sep).join('/');
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function inventory() {
  const usedPath = path.join(projectRoot, 'public/scene/scenes-used-files.json');
  const used = JSON.parse(await fs.readFile(usedPath, 'utf8'));
  const sections = {};
  for (const directory of ['assets', 'public/assets', 'public/scene', 'dist/scrapworks/browser', 'src', 'art']) {
    const entries = [];
    for (const file of await filesUnder(path.join(projectRoot, directory))) {
      const bytes = await fs.readFile(file);
      const name = relative(file);
      if (name === 'assets/.export-cache.json' || name === 'assets/.assets-cache.json') continue;
      const exportedName = name.startsWith('public/scene/') ? name.slice('public/scene/'.length) : null;
      entries.push({
        path: name,
        bytes: bytes.length,
        sha256: hash(bytes),
        ...(exportedName
          ? {
              scenes: Object.entries(used)
                .filter(([, paths]) => paths.includes(exportedName))
                .map(([scene]) => scene),
            }
          : {}),
      });
    }
    sections[directory] = { files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), entries };
  }
  const duplicates = new Map();
  for (const section of ['assets', 'public/assets', 'art'])
    for (const entry of sections[section].entries) {
      const group = duplicates.get(entry.sha256) ?? [];
      group.push({ path: entry.path, bytes: entry.bytes });
      duplicates.set(entry.sha256, group);
    }
  return {
    recordedAt: new Date().toISOString(),
    scope: 'On-disk files and Editor per-scene manifests; not a network measurement',
    scenes: used,
    sections,
    duplicates: [...duplicates.values()].filter((group) => group.length > 1 && group[0].bytes > 1024),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[process.argv.indexOf('--output') + 1];
  if (!process.argv.includes('--output') || !output) throw new Error('Usage: node tools/scenes/inventory.mjs --output <report.json>');
  const report = await inventory();
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sections).map(([name, value]) => [name, { files: value.files, bytes: value.bytes }]))));
}
