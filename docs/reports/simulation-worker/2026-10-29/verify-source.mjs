// Run after a cohort finishes and before changing any measured source.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [run, destination] = process.argv.slice(2);
if (!run || !destination) throw new Error('Usage: node verify-source.mjs run output.json');
const manifest = JSON.parse(await fs.readFile(path.join(run, 'manifest.json'), 'utf8'));
const files = [];
for (const [file, expected] of Object.entries(manifest.source.files)) {
  const actual = crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
  files.push({ file, expected, actual, match: expected === actual });
}
const result = {
  run: run.replaceAll('\\', '/'),
  verifiedAt: new Date().toISOString(),
  sourceRevision: manifest.revision,
  sourceFingerprint: manifest.source.hash,
  allMatch: files.every((file) => file.match),
  files,
};
await fs.writeFile(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, allMatch: result.allMatch }));
if (!result.allMatch) process.exitCode = 1;
