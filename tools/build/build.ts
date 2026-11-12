import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compressBuild, printCompression } from './compress.ts';
import { hasCode } from '../shared.ts';
import { prepareUiKit } from '../art/prepare-ui-kit.ts';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve('@angular/cli/package.json')), 'bin/ng.js');
const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
if (!help) await prepareUiKit(root);
const commands = [
  ...(help ? [] : [[path.join(root, 'tools/scenes/export.ts')]]),
  [cli, 'build', ...args],
];

for (const command of commands) {
  const result = spawnSync(process.execPath, command, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!help && !process.exitCode) {
  let output = 'dist/scrapworks';
  for (let index = 0; index < args.length; ++index) {
    if (args[index] === '--output-path') output = args[index + 1];
    else if (args[index].startsWith('--output-path='))
      output = args[index].slice('--output-path='.length);
  }
  // Angular emits dependency notices beside browser/, outside the static deployment root.
  // Keep them reachable from asset credits and included in portable browser packages.
  try {
    await fs.copyFile(
      path.resolve(root, output, '3rdpartylicenses.txt'),
      path.resolve(root, output, 'browser/3rdpartylicenses.txt'),
    );
  } catch (error) {
    // Development builds can disable Angular's extractLicenses option.
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  await fs.copyFile(path.join(root, 'LICENSE'), path.resolve(root, output, 'browser/LICENSE.txt'));
  console.log(`Compressing build output in ${path.resolve(root, output, 'browser')}...`);
  printCompression(await compressBuild(path.resolve(root, output, 'browser')));
}
