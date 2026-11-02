import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import type { CoverageOptions } from 'vitest/node';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
// The browser coverage target explicitly uses this Angular build configuration.
const workspace = JSON.parse(
  fs.readFileSync(new URL('../../angular.json', import.meta.url), 'utf8'),
) as {
  projects: {
    scrapworks: {
      architect: {
        build: {
          configurations: {
            development: {
              fileReplacements: { replace: string; with: string }[];
            };
          };
        };
      };
    };
  };
};
export const browserReplacements =
  workspace.projects.scrapworks.architect.build.configurations.development.fileReplacements;
export const gameInclude = ['src/**/*.ts'];
export const toolingInclude = [
  'eslint.config.ts',
  'tools/{architecture,cleanup,coverage,eslint,scenes,testing,world}/**/*.ts',
  'tools/shared.ts',
  'tools/ecs-bench/verify-production.ts',
];
export const coverageExclude = [
  '**/node_modules/**',
  '**/*.{spec,test}.ts',
  '**/*.d.ts',
  'src/**/testing/**',
  'src/scripts.ts',
  'src/scene-registrations.ts',
  'tools/world/test-fixture.ts',
  'tools/testing/inline-*.ts',
  'tools/testing/rebuild-physics.ts',
];

export function coverageOptions(source: 'game-node' | 'game-browser' | 'tooling') {
  return {
    provider: 'v8',
    include: source === 'tooling' ? toolingInclude : gameInclude,
    exclude: coverageExclude,
    excludeAfterRemap: true,
    reportsDirectory: fileURLToPath(new URL(`../../coverage/raw/${source}/`, import.meta.url)),
    reporter: ['json'],
    clean: true,
    reportOnFailure: false,
  } satisfies CoverageOptions;
}
