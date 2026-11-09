import { defineConfig, mergeConfig } from 'vitest/config';
import { coverageOptions } from './tools/coverage/config.ts';
import { nodeDefaults } from './tools/testing/vitest-node.ts';

export default mergeConfig(
  nodeDefaults,
  defineConfig({
    test: {
      include: [
        'tools/{architecture,build,coverage,eslint,scenes,world,testing}/**/*.test.ts',
        'tools/ecs-bench/verify-production.test.ts',
        'tools/save-bench/**/*.test.ts',
        'tools/portfolio/**/*.test.ts',
      ],
      coverage: coverageOptions('tooling'),
    },
  }),
);
