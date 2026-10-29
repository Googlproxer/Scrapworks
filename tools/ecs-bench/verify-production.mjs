import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
async function walk(folder) {
  return (await fs.readdir(folder, { withFileTypes: true }))
    .flatMap((entry) => (entry.isDirectory() ? [] : [path.join(folder, entry.name)]))
    .concat(
      ...(await Promise.all(
        (await fs.readdir(folder, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => walk(path.join(folder, e.name))),
      )),
    );
}
const stats = (await walk(path.join(root, 'dist/scrapworks'))).filter((file) =>
  /(?:^|[\\/])(?:browser-)?stats\.json$/.test(file),
);
if (!stats.length) throw new Error('Build with --stats-json before verifying ECS exclusion');
let count = 0;
for (const file of stats) {
  const metadata = JSON.parse(await fs.readFile(file, 'utf8'));
  const inputs = Object.keys(metadata.inputs ?? {});
  count += inputs.length;
  const forbidden = inputs.filter((input) =>
    /(?:^|[\\/])(?:miniplex|bitecs|koota|@lastolivegames[\\/]becsy|tools[\\/](?:ecs-bench|simulation-worker-bench))(?:[\\/]|$)/.test(
      input,
    ),
  );
  if (forbidden.length)
    throw new Error(`Benchmark code entered production: ${forbidden.join(', ')}`);
}
if (!count) throw new Error('No production build inputs were inspected');
console.log(`Verified ${count} production inputs: no ECS benchmark candidates or harness.`);
