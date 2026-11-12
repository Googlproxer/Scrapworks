import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Reproduce the small runtime subset without shipping concept art or generated originals. */
export async function prepareUiKit(
  root = path.resolve(import.meta.dirname, '../..'),
): Promise<void> {
  const groups = [
    { source: 'art/ui/kit/v1/sources', target: 'public/assets/ui/kit/v1', extension: '.svg' },
    { source: 'art/ui/sprites/v1/png/128', target: 'public/assets/ui/items', extension: '.png' },
  ];
  const exports: { source: string; target: string; sha256: string; bytes: number }[] = [];
  for (const group of groups) {
    await fs.mkdir(path.join(root, group.target), { recursive: true });
    const names = (await fs.readdir(path.join(root, group.source)))
      .filter((name) => name.endsWith(group.extension))
      .sort();
    for (const name of names) {
      const source = group.source + '/' + name;
      const target = group.target + '/' + name;
      const data = await fs.readFile(path.join(root, source));
      let existing: Buffer | undefined;
      try {
        existing = await fs.readFile(path.join(root, target));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      if (!existing?.equals(data)) await fs.writeFile(path.join(root, target), data);
      exports.push({
        source,
        target,
        sha256: createHash('sha256').update(data).digest('hex'),
        bytes: data.length,
      });
    }
  }
  const record =
    JSON.stringify(
      {
        tool: 'tools/art/prepare-ui-kit.ts',
        preparation:
          'Exact copies of the 26 kit SVGs and 31 square 128px transparent UI sprite derivatives. Original source artwork remains under art/.',
        exports,
      },
      null,
      2,
    ) + '\n';
  const recordPath = path.join(root, 'art/ui/kit/v1/runtime.json');
  let previous = '';
  try {
    previous = await fs.readFile(recordPath, 'utf8');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (previous !== record) await fs.writeFile(recordPath, record);
  console.log(
    'UI kit prepared: ' +
      exports.length +
      ' assets, ' +
      exports.reduce((sum, asset) => sum + asset.bytes, 0) +
      ' bytes.',
  );
}

if (import.meta.main) await prepareUiKit();
