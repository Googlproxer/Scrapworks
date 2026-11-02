import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export const nodeDefaults = defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    pool: 'forks',
    isolate: true,
    globals: false,
    restoreMocks: true,
    maxWorkers: 4,
  },
});
