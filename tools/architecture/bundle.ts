import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuildMetadata } from '../shared.ts';

export function gameRouteBytes(metadata: BuildMetadata): number {
  const outputs = metadata.outputs;
  const entry = Object.keys(outputs).find(
    (name) => outputs[name].entryPoint === 'src/app/features/game/game-page/game-page.component.ts',
  );
  if (!entry) throw new Error('Game route entry not found');
  const seen = new Set<string>();
  function visit(name: string): void {
    if (seen.has(name)) return;
    seen.add(name);
    for (const imported of outputs[name].imports ?? []) {
      if (imported.external || imported.kind !== 'import-statement') continue;
      const target = outputs[imported.path]
        ? imported.path
        : path.posix.join(path.posix.dirname(name), imported.path);
      if (outputs[target]) visit(target);
    }
  }
  visit(entry);
  return [...seen]
    .filter((file) => file.endsWith('.js'))
    .reduce((total, file) => total + (outputs[file].bytes ?? 0), 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(import.meta.dirname, '../..');
  const metadata = JSON.parse(
    await fs.readFile(path.join(root, 'dist/scrapworks/browser-stats.json'), 'utf8'),
  ) as BuildMetadata;
  const budget = JSON.parse(
    await fs.readFile(path.join(import.meta.dirname, 'bundle-limits.json'), 'utf8'),
  ) as { baseline: number; completed: number; warningRatio: number; failureRatio: number };
  const bytes = gameRouteBytes(metadata);
  const result = {
    baseline: budget.baseline,
    bytes,
    reduction: 1 - bytes / budget.baseline,
    warning: bytes > budget.completed * budget.warningRatio,
  };
  console.log(JSON.stringify(result));
  if (bytes > budget.baseline * 0.6 || bytes > budget.completed * budget.failureRatio)
    throw new Error('Game-route static JavaScript budget exceeded');
  if (result.warning)
    console.warn('Game-route JavaScript exceeds the completed result by more than 5%.');
}
