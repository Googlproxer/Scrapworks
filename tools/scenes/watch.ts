import { watch, readdirSync, statSync, readFileSync, type FSWatcher } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { SupersededExport } from './export-project.ts';
import { errorMessage } from '../shared.ts';

export function authoringEventRelevant(
  event: string,
  filename: string | undefined,
  directory: boolean,
  included: boolean,
): boolean {
  if (!filename) return true;
  if (event === 'change' && directory) return false;
  // Rename notifications may describe the parent of an attached source or a removed scene.
  return event === 'rename' || included;
}

export function exportQueue(
  exportAttempt: (isCurrent: () => boolean) => Promise<unknown>,
  {
    delay = 200,
    status = console.log,
  }: { delay?: number; status?: (message: string) => void } = {},
) {
  let generation = 0,
    dirty = false,
    closed = false,
    successful = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<boolean> | undefined;

  async function flush(): Promise<boolean> {
    clearTimeout(timer);
    if (running) return running;
    if (closed || !dirty) return successful;
    running = (async () => {
      do {
        const started = generation;
        dirty = false;
        status('Exporting saved Editor inputs...');
        try {
          await exportAttempt(() => !closed && generation === started);
          successful = true;
          status('Export published. Angular can reload the updated scenes.');
        } catch (error) {
          successful = false;
          status(
            error instanceof SupersededExport
              ? error.message
              : `Export failed; last working scenes retained: ${errorMessage(error)}`,
          );
        }
        if (dirty && !closed) await new Promise((resolve) => setTimeout(resolve, delay));
      } while (dirty && !closed);
      return successful;
    })();
    try {
      return await running;
    } finally {
      running = undefined;
    }
  }

  return {
    request() {
      if (closed) return;
      generation++;
      dirty = true;
      clearTimeout(timer);
      if (!running)
        timer = setTimeout(() => {
          void flush();
        }, delay);
    },
    flush,
    async close() {
      closed = true;
      clearTimeout(timer);
      await running;
    },
  };
}

export function watchAuthoring(
  root: string,
  {
    changed,
    failed,
    scripts,
  }: { changed: () => void; failed: (error: Error) => void; scripts: () => ReadonlySet<string> },
) {
  const watchers: FSWatcher[] = [];
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inventory = (): string => {
    const entries: string[] = [];
    const collect = (directory: string, include: (name: string) => boolean, relative = '') => {
      for (const entry of readdirSync(path.join(root, directory, relative), {
        withFileTypes: true,
      })) {
        const name = relative ? relative + '/' + entry.name : entry.name;
        if (!include(name)) continue;
        if (entry.isDirectory()) {
          if (name.endsWith('.scene')) entries.push(directory + '/' + name + '/');
          collect(directory, include, name);
        } else if (entry.isFile())
          entries.push(
            directory +
              '/' +
              name +
              ':' +
              createHash('sha256')
                .update(readFileSync(path.join(root, directory, name)))
                .digest('hex'),
          );
      }
    };
    collect(
      'assets',
      (name) =>
        !name.split('/').some((part) => part.startsWith('.')) &&
        !/(?:^|\/)README\.md$|(?:\.tmp|\.swp|~)$/.test(name),
    );
    // Source traversal permits directories; only attached source files enter the inventory.
    const source = (relative = '') => {
      for (const entry of readdirSync(path.join(root, 'src', relative), { withFileTypes: true })) {
        const name = relative ? relative + '/' + entry.name : entry.name;
        if (entry.isDirectory()) source(name);
        else if (
          !['scripts.ts', 'scene-registrations.ts'].includes(name) &&
          scripts().has('src/' + name)
        )
          entries.push(
            'src/' +
              name +
              ':' +
              createHash('sha256')
                .update(readFileSync(path.join(root, 'src', name)))
                .digest('hex'),
          );
      }
    };
    source();
    for (const { name } of readdirSync(root, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name.endsWith('.bjseditor'),
    ))
      entries.push(
        name +
          ':' +
          createHash('sha256')
            .update(readFileSync(path.join(root, name)))
            .digest('hex'),
      );
    const policy = path.join(root, 'tools/scenes/export-policy.json');
    try {
      entries.push('policy:' + createHash('sha256').update(readFileSync(policy)).digest('hex'));
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
    return entries.sort().join('\n');
  };
  let previous = inventory();
  const reconcile = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (closed) return;
      try {
        const next = inventory();
        if (next !== previous) {
          previous = next;
          changed();
        }
      } catch (error) {
        failed(error instanceof Error ? error : new Error(String(error)));
      }
    }, 20);
  };

  const add = (directory: string, recursive: boolean, include: (name: string) => boolean) => {
    const watcher = watch(path.join(root, directory), { recursive }, (event, filename) => {
      const name = filename?.toString().replaceAll('\\', '/');
      let directoryEntry = false;
      if (name) {
        try {
          directoryEntry = statSync(path.join(root, directory, name)).isDirectory();
        } catch {
          /* Deletions are reconciled against the inventory. */
        }
      }
      if (authoringEventRelevant(event, name, directoryEntry, !!name && include(name))) reconcile();
    });
    watcher.on('error', failed);
    watchers.push(watcher);
  };

  try {
    add(
      'assets',
      true,
      (name) =>
        !name.split('/').some((part) => part.startsWith('.')) &&
        !/(?:^|\/)README\.md$|(?:\.tmp|\.swp|~)$/.test(name),
    );
    add(
      'src',
      true,
      (name) =>
        !['scripts.ts', 'scene-registrations.ts'].includes(name) && scripts().has(`src/${name}`),
    );
    add('.', false, (name) => name.endsWith('.bjseditor'));
    add('tools/scenes', false, (name) => name === 'export-policy.json');
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw error;
  }
  return () => {
    closed = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}
