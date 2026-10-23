import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, filesUnder } from './inventory.mjs';
import { localPath } from './retain-assets.mjs';
import { verifyWorldExport } from '../world/verify-export.mjs';

const readJson = async (name) =>
  JSON.parse(await fs.readFile(path.join(projectRoot, name), 'utf8'));
const policy = await readJson('tools/scenes/export-policy.json');
// This file is generated independently of the Editor's scene manifests. Require it
// explicitly so a stale long-lived exporter cannot silently omit gameplay data.
const world = await verifyWorldExport(projectRoot);
const angular = await readJson('angular.json');
const publicRule = angular.projects.scrapworks.architect.build.options.assets.find(
  (entry) => entry.input === 'public',
);
const expected = policy.excludedPublicAssets.map((entry) => entry.path).sort();
for (const entry of [...policy.excludedPublicAssets, ...policy.provenance])
  await fs.access(localPath(projectRoot, entry.source));
if (JSON.stringify([...publicRule.ignore].sort()) !== JSON.stringify(expected))
  throw new Error('Angular public asset ignores differ from export-policy.json');
const used = await readJson('public/scene/scenes-used-files.json');
const allowed = new Set([...Object.values(used).flat(), ...policy.additionalSceneAssets]);
for (const name of allowed)
  await fs.access(localPath(path.join(projectRoot, 'public/scene'), name));
for (const file of await filesUnder(path.join(projectRoot, 'public/scene/assets'))) {
  const name = path
    .relative(path.join(projectRoot, 'public/scene'), file)
    .split(path.sep)
    .join('/');
  if (!allowed.has(name))
    throw new Error(`Unreferenced asset remains in the generated export: ${name}`);
}
const assetList = await readJson('public/scene/assets-list.json');
for (const name of assetList)
  await fs.access(localPath(path.join(projectRoot, 'public/scene'), name));
for (const entry of policy.retainedPublicAssets) {
  await fs.access(localPath(path.join(projectRoot, 'public'), entry.path));
  await fs.access(localPath(projectRoot, entry.consumer));
  if (expected.includes(entry.path)) throw new Error(`Live route asset is excluded: ${entry.path}`);
}
if (process.argv.includes('--build')) {
  const build = path.join(projectRoot, 'dist/scrapworks/browser');
  for (const name of expected) {
    if (await fs.stat(localPath(build, name)).catch(() => null))
      throw new Error(`Excluded public asset leaked into the build: ${name}`);
  }
  for (const file of await filesUnder(path.join(projectRoot, 'public/scene'))) {
    const name = path.relative(path.join(projectRoot, 'public'), file).split(path.sep).join('/');
    const destination = localPath(build, name);
    if (!(await fs.readFile(file)).equals(await fs.readFile(destination)))
      throw new Error(`Stale build copy: ${name}`);
  }
  for (const file of await filesUnder(path.join(build, 'scene/assets'))) {
    const name = path.relative(path.join(build, 'scene'), file).split(path.sep).join('/');
    if (!allowed.has(name))
      throw new Error(`Unreferenced scene asset leaked into the build: ${name}`);
  }
  for (const entry of policy.retainedPublicAssets) {
    if (
      !(await fs.readFile(localPath(build, entry.path))).equals(
        await fs.readFile(localPath(path.join(projectRoot, 'public'), entry.path)),
      )
    )
      throw new Error(`Changed live route asset: ${entry.path}`);
  }
}
console.log(
  JSON.stringify({
    sceneManifests: Object.keys(used).length,
    sceneDependencies: allowed.size,
    compiledWorld: world.id,
    excludedPublicFiles: expected.length,
    checkedBuild: process.argv.includes('--build'),
    status: 'passed',
  }),
);
