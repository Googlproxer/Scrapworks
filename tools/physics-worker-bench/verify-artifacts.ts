import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, reportRoot, toolRoot, digest, fileManifest, git, type Preparation } from './prepare.ts';
import { PROTOCOL, requireLocal } from './protocol.ts';
requireLocal();
const preparation = JSON.parse(await fs.readFile(path.join(reportRoot, 'preparation.json'), 'utf8')) as Preparation;
// Archiving experiment tooling advances HEAD without changing the measured production reference.
git('merge-base', '--is-ancestor', preparation.baseCommit, 'HEAD');
assert.equal(git('diff', preparation.baseCommit, '--', 'src', 'assets', 'public', 'package.json', 'yarn.lock', 'angular.json', '.github'), '', 'Production source/configuration drift from the frozen base');
assert.equal(digest(JSON.stringify(PROTOCOL)), preparation.protocolSha256, 'Protocol drift');
const frozen = JSON.parse(await fs.readFile(path.join(reportRoot, `prepared-${preparation.id}-files.json`), 'utf8')) as { tools: { path: string; sha256: string }[] };
const tools = await fileManifest(toolRoot);
for (const name of ['browser-probe.ts', 'instrument.ts', 'variants.ts', 'remote-physics.ts', 'physics-protocol.ts', 'physics-host.ts', 'physics.worker.ts']) assert.equal(tools.find(file => file.path === name)?.sha256, frozen.tools.find(file => file.path === name)?.sha256, `Artifact-producing source drift: ${name}`);
const variants: Record<string, string> = {};
for (const [name, variant] of Object.entries(preparation.variants)) { const actual = digest(JSON.stringify(await fileManifest(path.join(variant.artifact, 'browser')))); assert.equal(actual, variant.manifestSha256, `Artifact drift: ${name}`); variants[name] = actual; }
const setup = JSON.parse(await fs.readFile(path.join(reportRoot, 'setup.json'), 'utf8')) as { b0Build: { manifest: string } };
// The original receipt hashes its formatted manifest envelope, unlike the newer flat lists.
const originalManifest = await fs.readFile(path.join(root, setup.b0Build.manifest)), originalB0 = digest(originalManifest);
assert.equal(originalB0, preparation.originalB0ManifestSha256, 'Original B0 manifest drift');
const originalFiles = (JSON.parse(originalManifest.toString()) as { files: { path: string; sha256: string }[] }).files;
for (const file of originalFiles) assert.equal(digest(await fs.readFile(path.join(root, file.path))), file.sha256, `Original B0 artifact drift: ${file.path}`);
const directory = path.join(root, 'docs/reports/split-physics-worker/2026-11-11');
const frozenRuntime = JSON.parse(await fs.readFile(path.join(directory, 'primary-runtime-metadata.json'), 'utf8')) as { runtimeScripts: { input: string; render: string } };
const primaryScripts = { input: digest(await fs.readFile(path.join(directory, 'primary-input-bootstrap.js'))), render: digest(await fs.readFile(path.join(directory, 'primary-render-helper.js'))) };
assert.deepEqual(primaryScripts, { input: frozenRuntime.runtimeScripts.input, render: frozenRuntime.runtimeScripts.render });
if (process.argv.includes('--live')) {
  const live = await (await fetch('http://127.0.0.1:4319/metadata')).json() as { runtimeScripts: { primaryInput: string; primaryRender: string } };
  assert.equal(live.runtimeScripts.primaryInput, primaryScripts.input); assert.equal(live.runtimeScripts.primaryRender, primaryScripts.render);
}
const result = { at: new Date().toISOString(), preparation: preparation.id, variants, originalB0, primaryScripts, liveVerified: process.argv.includes('--live'), protocolSha256: preparation.protocolSha256, baseCommit: preparation.baseCommit, verifiedHeadCommit: git('rev-parse', 'HEAD'), productionUnchanged: true, currentToolsSha256: digest(JSON.stringify(tools)) };
await fs.writeFile(path.join(root, 'docs/reports/split-physics-worker/2026-11-11', `verification-${Date.now()}.json`), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
