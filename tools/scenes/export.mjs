import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportProject } from './export-project.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  const report = await exportProject(root, { signal: controller.signal });
  console.log(`Scene export: retained ${report.retainedFiles} files; excluded ${report.removedFiles} unused generated assets (${report.removedBytes} bytes).`);
} catch (error) {
  console.error(`Scene export failed: ${error.message}`);
  process.exitCode = controller.signal.aborted ? 130 : 1;
}
