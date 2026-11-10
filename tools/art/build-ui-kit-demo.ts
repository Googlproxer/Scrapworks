import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'art/ui/kit/v1');
execFileSync(
  process.execPath,
  [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(directory, 'tsconfig.json')],
  { cwd: root, stdio: 'inherit' },
);
await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: directory,
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    lib: {
      entry: path.join(directory, 'crank-demo.ts'),
      formats: ['iife'],
      name: 'ScrapworksCrankDemo',
      fileName: () => 'crank-demo.js',
    },
  },
});
const output = path.join(directory, 'crank-demo.js');
const code = await fs.readFile(output, 'utf8');
await fs.writeFile(
  output,
  '/* Generated from crank-demo.ts by tools/art/build-ui-kit-demo.ts. Classic bundle supports file:// previews. */\n' +
    code,
);
await fs.copyFile(
  path.join(root, 'node_modules/rxjs/LICENSE.txt'),
  path.join(directory, 'crank-demo.LICENSE.txt'),
);
console.log(`Built standalone crank demo: ${output}`);
