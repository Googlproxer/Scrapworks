import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, reportRoot, digest, fileManifest, runNode, fixNestedWorkerUrl, type Preparation } from './prepare.ts';
import { replaceExact } from './instrument.ts';
import { requireRunRelease } from './protocol.ts';
requireRunRelease(process.argv.includes('--start-authorized'));
// Additional image/contact diagnostics only. Never replace the frozen primary preparation.
const preparation = JSON.parse(await fs.readFile(path.join(reportRoot, 'preparation.json'), 'utf8')) as Preparation;
const id = 'contact-' + randomUUID().slice(0, 8), variants: Preparation['variants'] = {};
for (const architecture of ['B0', 'C1'] as const) {
  const original = preparation.variants[architecture];
  assert.equal(digest(JSON.stringify(await fileManifest(path.join(original.artifact, 'browser')))), original.manifestSha256, 'Primary artifact drift');
  const project = path.join(root, 'tmp/physics-worker-bench', id, architecture.toLowerCase() + '-project');
  const artifact = path.join(root, 'dist/physics-worker-bench', id, architecture.toLowerCase());
  await fs.mkdir(project, { recursive: true }); await fs.cp(path.join(original.project, 'src'), path.join(project, 'src'), { recursive: true });
  for (const name of ['angular.json', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.worker.json']) await fs.copyFile(path.join(original.project, name), path.join(project, name));
  await fs.symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'junction');
  await fs.symlink(path.join(root, 'public'), path.join(project, 'public'), 'junction');
  const probeFile = path.join(project, 'src/physics-worker-probe.ts');
  let probe = (await fs.readFile(probeFile, 'utf8')).replaceAll('\r\n', '\n');
  probe = replaceExact(probe, 'declare global {', 'declare global {\n  var __scrapworksFrameObserver: ((event: TraceEvent) => void) | undefined;');
  probe = replaceExact(probe, '\n}\n\nexport function drainTrace()', "\n  if (realm === 'main') globalThis.__scrapworksFrameObserver?.(buffer[(written - 1) % capacity]!);\n}\n\nexport function drainTrace()");
  await fs.writeFile(probeFile, probe);
  const bodiesFile = path.join(project, 'src/game/views/physics-body-views.ts');
  let bodies = (await fs.readFile(bodiesFile, 'utf8')).replaceAll('\r\n', '\n');
  bodies = "import { trace } from '../../physics-worker-probe';\nconst contactBodyProbe = new URL(location.href).searchParams.get('contactProbe') === '1';\n" + bodies;
  bodies = replaceExact(bodies, '    }\n  }\n\n  private remove(id: string): void {', `    }
    if (contactBodyProbe) {
      let recorded = 0;
      for (const [id, record] of this.bodies) {
        if (id.startsWith('dense-') && !['dense-0', 'dense-1', 'dense-2', 'dense-3'].includes(id)) continue;
        if (++recorded > 4) break;
        trace('body-present', { id, x: record.mesh.position.x / 100, y: record.mesh.position.y / 100, z: record.mesh.position.z / 100 });
      }
    }
  }

  private remove(id: string): void {`);
  await fs.writeFile(bodiesFile, bodies);
  const cameraFile = path.join(project, 'src/game/views/camera-controller.ts');
  let camera = (await fs.readFile(cameraFile, 'utf8')).replaceAll('\r\n', '\n');
  camera = "const contactFixedCamera = new URL(location.href).searchParams.get('fixedCamera') === '1';\n" + camera;
  camera = replaceExact(camera, '    this.camera.setTarget(', '    if (!contactFixedCamera || globalThis.__scrapworksExperimentInput?.probeId === undefined) this.camera.setTarget(');
  await fs.writeFile(cameraFile, camera);
  await runNode([path.join(root, 'node_modules/@angular/cli/bin/ng.js'), 'build', '--configuration', 'production', '--stats-json', '--output-path', artifact], project);
  if (architecture === 'C1') await fixNestedWorkerUrl(artifact);
  variants[architecture + '-contact'] = { project, artifact, manifestSha256: digest(JSON.stringify(await fileManifest(path.join(artifact, 'browser')))) };
}
const descriptor = { id, primaryPreparation: preparation.id, variants, purpose: 'Separate support-relative and fixed-camera diagnostics; primary artifacts and preparation are unchanged.' };
const directory = path.join(root, 'docs/reports/split-physics-worker/2026-11-11');
try { const previous = await fs.readFile(path.join(directory, 'diagnostic-preparation.json'), 'utf8'); const old = JSON.parse(previous) as { id: string }; await fs.writeFile(path.join(directory, `diagnostic-preparation-${old.id}.json`), previous); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await fs.writeFile(path.join(directory, `diagnostic-preparation-${id}.json`), JSON.stringify(descriptor, null, 2));
await fs.writeFile(path.join(directory, 'diagnostic-preparation.json'), JSON.stringify(descriptor, null, 2));
console.log(JSON.stringify(descriptor));
