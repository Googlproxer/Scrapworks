import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { SupersededExport } from './export-project.ts';
import { errorMessage } from '../shared.ts';

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

  const add = (directory: string, recursive: boolean, include: (name: string) => boolean) => {
    const watcher = watch(path.join(root, directory), { recursive }, (_, filename) => {
      const name = filename?.toString().replaceAll('\\', '/');
      if (!name || include(name)) changed();
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
    add('src', true, (name) => name !== 'scripts.ts' && scripts().has(`src/${name}`));
    add('.', false, (name) => name.endsWith('.bjseditor'));
    add('tools/scenes', false, (name) => name === 'export-policy.json');
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw error;
  }
  return () => {
    for (const watcher of watchers) watcher.close();
  };
}
