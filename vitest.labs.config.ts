import { defineConfig, mergeConfig } from 'vitest/config';
import { nodeDefaults } from './tools/testing/vitest-node.ts';

export default mergeConfig(
  nodeDefaults,
  defineConfig({
    test: {
      include: ['tools/ecs-bench/protocol.test.ts', 'tools/simulation-worker-bench/**/*.test.ts'],
    },
  }),
);
