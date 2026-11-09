import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { filesUnder, hash } from '../scenes/inventory.ts';

const root = path.resolve(import.meta.dirname, '../..');
const browser = path.join(root, 'dist/scrapworks/browser');
// Re-export Editor inputs and rebuild assets/configuration before recording their identity.
// File mtimes cannot detect removed inputs or edits outside src.
execFileSync(
  process.execPath,
  [path.join(root, 'tools/build/build.ts'), '--configuration', 'production', '--stats-json'],
  { cwd: root, stdio: 'inherit' },
);
const entries = await Promise.all(
  (await filesUnder(browser)).map(async (file) => ({
    path: path.relative(browser, file).replaceAll('\\', '/'),
    sha256: hash(await fs.readFile(file)),
    bytes: (await fs.stat(file)).size,
  })),
);
if (!entries.some((e) => e.path === 'index.html'))
  throw new Error('Build production output before packaging');
const source = await Promise.all(
  (await filesUnder(path.join(root, 'src'))).map(async (file) => ({
    path: path.relative(root, file).replaceAll('\\', '/'),
    sha256: hash(await fs.readFile(file)),
  })),
);
const config = await Promise.all(
  ['package.json', 'yarn.lock', 'angular.json'].map(async (name) => ({
    path: name,
    sha256: hash(await fs.readFile(path.join(root, name))),
  })),
);
const directory = await fs.mkdtemp(path.join(root, 'dist/portfolio-current-assets-'));
await fs.cp(browser, path.join(directory, 'browser'), { recursive: true });
await fs.copyFile(path.join(import.meta.dirname, 'serve.ts'), path.join(directory, 'serve.ts'));
await fs.copyFile(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
  path.join(directory, 'browser-stats.json'),
);
const manifest = {
  recordedAt: new Date().toISOString(),
  stage: 'M10 current-asset local handoff',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
  runtimeSourceHash: hash(JSON.stringify(source)),
  config,
  artifactHash: hash(JSON.stringify(entries)),
  files: entries,
  limits: [
    'Asset audit/replacements/final qualification deferred',
    'Human 30–60 minute pacing playtest deferred by user',
    'Other hardware and public hosting unqualified',
  ],
  instructions: 'Node 24.21+: node serve.ts --directory browser --port 4173',
};
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(
  path.join(directory, 'README.md'),
  `# Scrapworks current-asset demo

Use Node 24.21 or compatible Node 24. From this extracted directory run:

\`\`\`powershell
node serve.ts --directory browser --port 4173
\`\`\`

Open http://127.0.0.1:4173/ in Chromium or Firefox. Stop with Ctrl+C. Keep the same site address/port to retain that browser's saves. Do not open index.html directly as a file.

Start a New Game or Continue. Follow the objective guide. Tab opens the field kit; its Field manual explains the controls, crafting/research, factory connections, restoration and saves. Hide/reopen the objective guide as desired. Escape/Menu pauses.

Each browser profile and site origin owns separate local saves. Save & load manages named runs, manual/auto revisions, recovery and JSON transfer. Download current progress protects against cleared storage and works when storage fails. Import creates a distinct run; activate it deliberately.

This is a functional prototype with the current assets. Asset audit/replacements and final performance qualification remain deferred. The 30–60 minute first-restoration target awaits the user's human playtest; other/lower-end hardware is not qualified. No public hosting/cloud sync is included.

manifest.json records the exact artifact hashes, runtime source/config identity and uncommitted status. The original and Brotli sidecars are both supplied; the preview negotiates Brotli and falls back to originals. Production hosting must preserve correct content types, relative assets and application-route fallback.

Portable hardware testing uses the repository tools and locked dependencies: build with stats, install matching Playwright Chromium/Firefox, then run node tools/portfolio/run.ts --browser all --headed --output docs/reports/milestone-10/my-device. It is local/manual only, never CI. See docs/portfolio/README.md in the source checkout for full measurement and playtest instructions.
`,
);
console.log(directory);
