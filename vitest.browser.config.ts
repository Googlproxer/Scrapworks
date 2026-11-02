import { defineConfig } from 'vitest/config';
import { coverageOptions } from './tools/coverage/config.ts';

// Angular owns browser setup, test discovery and compilation.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { coverage: coverageOptions('game-browser') },
});
