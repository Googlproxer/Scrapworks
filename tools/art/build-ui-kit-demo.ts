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
for (const entry of ['crank-demo', 'sprite-demo']) {
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
        entry: path.join(directory, entry + '.ts'),
        formats: ['iife'],
        name: entry === 'crank-demo' ? 'ScrapworksCrankDemo' : 'ScrapworksSpriteDemo',
        fileName: () => entry + '.js',
      },
    },
  });
  const output = path.join(directory, entry + '.js');
  const code = await fs.readFile(output, 'utf8');
  await fs.writeFile(
    output,
    '/* Generated from ' +
      entry +
      '.ts by tools/art/build-ui-kit-demo.ts. Classic bundle supports file:// previews. RxJS licence: crank-demo.LICENSE.txt. */\n' +
      code,
  );
  console.log('Built standalone UI demo: ' + output);
}
await fs.copyFile(
  path.join(root, 'node_modules/rxjs/LICENSE.txt'),
  path.join(directory, 'crank-demo.LICENSE.txt'),
);
