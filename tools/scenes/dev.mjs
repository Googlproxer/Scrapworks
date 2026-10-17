import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { attachedScripts, exportProject } from './export-project.mjs';
import { exportQueue, watchAuthoring } from './watch.mjs';
import { stopProcessTree } from './processes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const controller = new AbortController();
let server,
  stopWatching,
  scripts = new Set();
const queue = exportQueue(async (isCurrent) => {
  scripts = await attachedScripts(root);
  await exportProject(root, { signal: controller.signal, isCurrent });
});
const stop = () => {
  stopWatching?.();
  controller.abort();
  void stopProcessTree(server);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  stopWatching = watchAuthoring(root, {
    changed: () => queue.request(),
    scripts: () => scripts,
    failed: (error) => {
      console.error(`Authoring watcher failed: ${error.message}`);
      stop();
    },
  });
  queue.request();
  if (!(await queue.flush())) throw new Error('Initial export failed. Fix the reported authoring error before starting development.');
  if (!controller.signal.aborted) {
    const require = createRequire(import.meta.url);
    const cli = path.join(path.dirname(require.resolve('@angular/cli/package.json')), 'bin/ng.js');
    server = spawn(process.execPath, [cli, 'serve', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
    process.exitCode = await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', (code) => resolve(controller.signal.aborted ? 0 : (code ?? 1)));
    });
  }
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  stop();
  await queue.close();
  await stopProcessTree(server);
}
