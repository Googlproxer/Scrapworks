import { watch } from 'node:fs';
import path from 'node:path';
import { SupersededExport } from './export-project.mjs';

export function exportQueue(exportAttempt, { delay = 200, status = console.log } = {}) {
  let generation = 0,
    dirty = false,
    closed = false,
    timer,
    running,
    successful = false;
  async function flush() {
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
          status(error instanceof SupersededExport ? error.message : `Export failed; last working scenes retained: ${error.message}`);
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

export function watchAuthoring(root, { changed, failed, scripts }) {
  const watchers = [];
  const add = (directory, recursive, include) => {
    const watcher = watch(path.join(root, directory), { recursive }, (_, filename) => {
      const name = filename?.toString().replaceAll('\\', '/');
      if (!name || include(name)) changed();
    });
    watcher.on('error', failed);
    watchers.push(watcher);
  };
  try {
    add('assets', true, (name) => !name.split('/').some((part) => part.startsWith('.')) && !/(?:^|\/)README\.md$|(?:\.tmp|\.swp|~)$/.test(name));
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
