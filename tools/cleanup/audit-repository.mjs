import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const names = (text) => text.split('\0').filter(Boolean);
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const generated = [
  'public/scene/',
  'src/scripts.ts',
  'tmp/',
  'dist/',
  'node_modules/',
  '.angular/cache/',
  '.vitest/',
  '.bjseditor/',
  'coverage/',
  'out-tsc/',
  'assets/.export-cache.json',
  'assets/.assets-cache.json',
];
const isGenerated = (name) => generated.some((prefix) => (prefix.endsWith('/') ? name.startsWith(prefix) : name === prefix));
const ignoreProbes = generated.map((name) => (name.endsWith('/') ? `${name}__cleanup_probe__` : name));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Review source symbolic link explicitly: ${file}`);
    result.push(...(entry.isDirectory() ? await walk(file) : [file]));
  }
  return result;
}

const index = path.resolve(root, git('rev-parse', '--git-path', 'index').trim());
const before = { head: git('rev-parse', 'HEAD').trim(), index: hash(await fs.readFile(index)) };
const tracked = new Set(names(git('ls-files', '--cached', '-z')));
const sourceFiles = [];
for (const directory of ['art', 'assets', 'map', 'src', 'tools', 'docs'])
  for (const file of await walk(path.join(root, directory))) {
    const name = relative(file);
    if (!isGenerated(name) && !name.endsWith('.tiled-session') && !name.endsWith('.pyc') && !name.includes('/__pycache__/')) sourceFiles.push(name);
  }
const rootFiles = ['scrapworks.bjseditor', 'package.json', 'yarn.lock', 'angular.json', '.gitignore', 'README.md', 'AGENTS.md', '.codex/config.toml'];
for (const name of rootFiles) {
  await fs.access(path.join(root, name));
  sourceFiles.push(name);
}
sourceFiles.sort();
let ignored;
try {
  ignored = execFileSync('git', ['--no-optional-locks', '-C', root, 'check-ignore', '--no-index', '--stdin', '-z'], {
    input: [...sourceFiles, ...ignoreProbes].join('\0') + '\0',
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
} catch (error) {
  if (error.status !== 1) throw error;
  ignored = error.stdout;
}
const ignoredNames = new Set(names(ignored));
const ignoredSources = sourceFiles.filter((name) => ignoredNames.has(name));
const untrackedSources = sourceFiles.filter((name) => !tracked.has(name));
const trackedGenerated = [...tracked].filter(isGenerated);
const missingIgnoreRules = ignoreProbes.filter((name) => !ignoredNames.has(name));
const groups = Object.fromEntries(
  ['art', 'assets', 'map', 'src', 'tools', 'docs'].map((directory) => [
    directory,
    {
      files: sourceFiles.filter((name) => name.startsWith(directory + '/')).length,
      untracked: untrackedSources.filter((name) => name.startsWith(directory + '/')).length,
    },
  ]),
);
if (git('rev-parse', 'HEAD').trim() !== before.head || hash(await fs.readFile(index)) !== before.index)
  throw new Error('Git changed during the read-only audit; rerun against a stable index');
const failures = [
  ...ignoredSources.map((name) => `Authored source is ignored: ${name}`),
  ...trackedGenerated.map((name) => `Generated output is tracked: ${name}`),
  ...missingIgnoreRules.map((name) => `Missing generated ignore rule: ${name}`),
];
if (process.argv.includes('--require-tracked') && untrackedSources.length)
  failures.push(`${untrackedSources.length} authored source/tool files still need review and tracking`);
const report = {
  recordedAt: new Date().toISOString(),
  readOnly: true,
  baseCommit: before.head,
  gitHeadAndIndexUnchanged: true,
  groups,
  sourceFiles: sourceFiles.length,
  generatedIgnoreRulesVerified: ignoreProbes.length,
  ignoredSources,
  trackedGenerated,
  untrackedSources,
  failures,
  trackingComplete: untrackedSources.length === 0,
  note: 'Untracked authored inputs are reported for human review. This tool never stages, commits, deletes or rewrites game code.',
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  if (!process.argv[outputIndex + 1]) throw new Error('Expected --output <report.json>');
  const output = path.resolve(process.argv[outputIndex + 1]);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(
  JSON.stringify(
    { groups, sourceFiles: sourceFiles.length, generatedIgnoreRulesVerified: ignoreProbes.length, untrackedSources: untrackedSources.length, failures },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
