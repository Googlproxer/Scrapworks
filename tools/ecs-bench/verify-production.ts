import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuildMetadata } from '../shared.ts';
const root = path.resolve(import.meta.dirname, '../..');
const forbidden =
  /(?:^|\/)(?:bitecs|koota|@lastolivegames\/becsy|@msgpack\/msgpack|@babylonjs-toolkit|tools\/(?:ecs-bench|simulation-worker-bench|game-bench|save-bench|testing))(?:\/|$)/;
const authority =
  /(?:^|\/)(?:miniplex|@miniplex)(?:\/|$)|src\/(?:simulation\/(?:ecs-runtime|simulation)\.ts|session\/(?:runtime|inline-port|inline-game-session)\.ts)/;

/** Worker URLs are independent entry points, never ordinary main-graph imports. */
export function verifyMetadata(metadata: BuildMetadata) {
  const outputs = metadata.outputs ?? {};

  const normalize = (value: string) => value.replaceAll('\\', '/');

  const named = new Map(Object.keys(outputs).map((key) => [normalize(key), key]));

  const visit = (entry: string, visited = new Set<string>()): Set<string> => {
    if (visited.has(entry)) return visited;
    visited.add(entry);
    for (const imported of outputs[entry].imports ?? []) {
      if (imported.external || imported.kind === 'url-token') continue;
      const next =
        named.get(normalize(imported.path)) ??
        named.get(path.posix.join(path.posix.dirname(normalize(entry)), normalize(imported.path)));
      if (next) visit(next, visited);
    }
    return visited;
  };

  const entries = Object.keys(outputs).filter((key) => outputs[key].entryPoint);
  const workers = entries.filter(
    (key) => normalize(outputs[key].entryPoint!) === 'src/workers/simulation.worker.ts',
  );
  if (workers.length !== 1)
    throw new Error('Expected exactly one production simulation worker entry');
  const workerGraph = visit(workers[0]);
  const mainGraph = new Set(
    // Worker code-split chunks also have entryPoint metadata. They are worker roots,
    // while any actual main import of them remains reachable from the main entry.
    entries.filter((key) => !workerGraph.has(key)).flatMap((key) => [...visit(key)]),
  );

  const inspect = (keys: Iterable<string>, isWorker: boolean) => {
    const inputs = [...keys].flatMap((key) =>
      Object.keys(outputs[key].inputs ?? {}).map(normalize),
    );
    for (const input of inputs) {
      if (/src\/testing\/|\.(?:spec|test)\.ts$|node_modules\/(?:vitest|@vitest)\//.test(input))
        throw new Error(`Test support entered production: ${input}`);
      if (
        /src\/app\/features\/save\/(?:save-load\/|save\.service\.ts|schema\.ts|developer-save-dialog\.development\.ts)/.test(
          input,
        )
      )
        throw new Error(`Developer save utility entered production: ${input}`);
      if (
        /src\/game\/debug\/inspector-loader\.development\.ts|node_modules\/@babylonjs\/inspector\//.test(
          input,
        )
      )
        throw new Error(`Development Inspector entered production: ${input}`);
      if (
        /src\/game\/debug\/draw\/(?:backend\.development|development-renderer|geometry)\.ts$/.test(
          input,
        )
      )
        throw new Error(`Development debug renderer entered production: ${input}`);
      if (forbidden.test(input)) throw new Error(`Investigation code entered production: ${input}`);
      if (!isWorker && authority.test(input))
        throw new Error(`Simulation authority entered main graph: ${input}`);
      if (!isWorker && /node_modules\/@dimforge\/rapier|src\/simulation\/physics\//.test(input))
        throw new Error(`Physics authority entered main graph: ${input}`);
      if (isWorker && /src\/(?:app|game)\//.test(input))
        throw new Error(`Presentation entered worker graph: ${input}`);
      if (isWorker && /(?:^|\/)node_modules\/rxjs\//.test(input))
        throw new Error(`RxJS entered simulation worker graph: ${input}`);
    }
    return inputs;
  };

  const mainInputs = inspect(mainGraph, false),
    workerInputs = inspect(workerGraph, true);
  if (!workerInputs.some((input) => /node_modules\/miniplex\//.test(input)))
    throw new Error('Worker does not contain pinned Miniplex');
  const reachable = new Set([...mainGraph, ...workerGraph]);
  if (reachable.size !== Object.keys(outputs).filter((key) => key.endsWith('.js')).length) {
    // CSS/assets are not JavaScript graphs. Audit any otherwise orphaned JS as main.
    inspect(
      Object.keys(outputs).filter((key) => key.endsWith('.js') && !reachable.has(key)),
      false,
    );
  }
  return {
    mainInputs: new Set(mainInputs).size,
    workerInputs: new Set(workerInputs).size,
    worker: workers[0],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const metadata = JSON.parse(
    await fs.readFile(path.join(root, 'dist/scrapworks/browser-stats.json'), 'utf8'),
  );
  console.log('Verified production worker/main separation:', verifyMetadata(metadata));
}
