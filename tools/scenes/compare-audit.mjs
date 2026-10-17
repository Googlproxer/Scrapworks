import fs from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node tools/scenes/compare-audit.mjs <report-directory>');
const read = async (name) => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
const before = await read('before.json');
const after = await read('after.json');
const browserBefore = await read('browser-before.json');
const browserAfter = await read('browser-after.json');
const unchanged = {};
const rebasedArtNavigationFiles = [];
const relocation = JSON.parse(await fs.readFile(new URL('../../art/relocation-2026-10-17.json', import.meta.url), 'utf8'));
const canonicalPath = (name) => name.replace(/^docs\/art\//, 'art/');
const rebasedNavigationPaths = new Set(['art/branding/title-logo-generation.json', 'art/ui/mouse-cursor-generation.json']);
for (const section of ['assets', 'public/assets', 'src', 'art', 'map']) {
  // Documentation may describe the cleanup; binary art, exact prompts/records, and code must remain intact.
  const originalSection = before.sections[section] ?? (section === 'art' ? before.sections['docs/art'] : undefined);
  const currentSection = after.sections[section] ?? (section === 'art' ? after.sections['docs/art'] : undefined);
  if (!originalSection || !currentSection) throw new Error(`Missing inventory section: ${section}`);
  const original = originalSection.entries.filter((entry) => !entry.path.endsWith('.md'));
  const current = new Map(currentSection.entries.map((entry) => [canonicalPath(entry.path), entry]));
  unchanged[section] = 0;
  for (const entry of original) {
    const updated = current.get(canonicalPath(entry.path));
    if (updated?.sha256 === entry.sha256) {
      unchanged[section]++;
      continue;
    }
    // The move rebased two live JSON navigation fields. Accept only their recorded before/after hashes.
    const moved = section === 'art' && relocation.files.find((file) => file.from === entry.path && file.to === updated?.path);
    if (moved && rebasedNavigationPaths.has(moved.to) && moved.sha256Before === entry.sha256 && moved.sha256After === updated.sha256) {
      rebasedArtNavigationFiles.push({ before: moved.from, after: moved.to });
      continue;
    }
    throw new Error(`Protected source changed: ${entry.path}`);
  }
}
const oldJs = before.sections['dist/scrapworks/browser'].entries.filter((entry) => entry.path.endsWith('.js'));
const newBuild = new Map(after.sections['dist/scrapworks/browser'].entries.map((entry) => [entry.path, entry]));
for (const entry of oldJs) if (newBuild.get(entry.path)?.sha256 !== entry.sha256) throw new Error(`Application JavaScript changed: ${entry.path}`);
const bodies = (entries) => entries.reduce((sum, entry) => sum + entry.encodedBodyBytes, 0);
const browser = browserBefore.routes.map((route) => {
  const current = browserAfter.routes.find((entry) => entry.route === route.route);
  if (!route.readyFrameObserved || !current?.readyFrameObserved) throw new Error(`Rendered readiness was not observed: ${route.route}`);
  if (!current || [...route.errors, ...route.failures, ...current.errors, ...current.failures].length)
    throw new Error(`Browser validation failed: ${route.route}`);
  const record = {
    route: route.route,
    menuBeforeBytes: bodies(route.menu),
    menuAfterBytes: bodies(current.menu),
    gameAdditionalBeforeBytes: bodies(route.gameAdditionalRequests),
    gameAdditionalAfterBytes: bodies(current.gameAdditionalRequests),
  };
  const oldRequests = [...route.menu, ...route.gameAdditionalRequests].map((entry) => entry.path).sort();
  const newRequests = [...current.menu, ...current.gameAdditionalRequests].map((entry) => entry.path).sort();
  record.requestPathsUnchanged = JSON.stringify(oldRequests) === JSON.stringify(newRequests);
  return record;
});
const sizes = Object.fromEntries(
  ['assets', 'public/assets', 'public/scene', 'dist/scrapworks/browser'].map((section) => [
    section,
    {
      beforeBytes: before.sections[section].bytes,
      afterBytes: after.sections[section].bytes,
      reductionPercent: 100 * (1 - after.sections[section].bytes / before.sections[section].bytes),
    },
  ]),
);
const report = {
  recordedAt: new Date().toISOString(),
  sourceFilesVerifiedUnchanged: unchanged,
  rebasedArtNavigationFiles,
  applicationJavaScriptFilesUnchanged: oldJs.length,
  sizes,
  browser,
};
await fs.writeFile(path.join(directory, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
