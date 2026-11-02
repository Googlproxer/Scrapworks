import { defineConfig, mergeConfig } from 'vitest/config';
import { coverageOptions } from './tools/coverage/config.ts';
import { nodeDefaults } from './tools/testing/vitest-node.ts';

export default mergeConfig(
  nodeDefaults,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      coverage: coverageOptions('game-node'),
    },
  }),
);
