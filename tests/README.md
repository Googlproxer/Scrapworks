# Game tests

Game suites sit beside their production modules. `src/**/*.test.ts` suites run in Vitest's Node environment; `src/**/*.spec.ts` suites run through Angular in Chromium. This directory holds shared fixtures, the independent simulation oracle and browser acceptance probes that span multiple systems.

| Location                   | Scope                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/session/](../src/session/)       | Host scheduling, commands/capture continuation, completed hooks, worker transport and failure lifecycle.                                        |
| [src/simulation/](../src/simulation/) | Authoritative movement, placement/collision, ECS storage/publication, inventory/work primitives, snapshot validation and reference equivalence. |
| [support/](support/)       | Plain world fixtures and the independent simulation oracle.                                                                                     |
| [acceptance/](acceptance/) | Real application flows against built or running development applications.                                                                       |

## Commands

Run from the repository root with the pinned Node and Yarn versions.

```sh
yarn test:game
yarn test:game src/session
yarn test:game src/simulation
```

`test:game` strictly typechecks these suites and the independent oracle before running the Node tests. It requires neither scene export nor a browser. Vitest runs these suites in its real Node environment with file isolation, real timers and automatic mock restoration. Vite resolves source aliases from the repository's TypeScript configuration; no native Node loader or Angular test setup is needed. The plain [world fixture](support/world-fixture.ts) uses gameplay metres and keeps session/simulation tests independent of Editor marker compilation.

Foundation tests exercise actual opening commands and production player/deposit/pile schemas. Detached packet fixtures cover growth/malformed transport without arbitrary simulation mutation hooks. Shared inline controls live under `tools/testing`; current-game benchmark captures belong to [tools/game-bench](../tools/game-bench/README.md).

[Physics boundary regressions](../src/simulation/physics/physics-boundaries.test.ts) cover native/ECS configuration disagreement without replacing the active world, terrain/entity identity separation, elevated salvage overflow capture/continuation/pickup, and independent presentation collection invalidation. Native corruption fixtures edit detached bytes through Rapier's public API; they add no simulation mutation hooks. The renderer ground-item tests cover elevation, stable meshes, removal and skipped scans for unchanged arrays.

## Coverage

`yarn test:coverage` runs the normal tooling suites plus both game environments and creates two reports. Use `yarn test:coverage:game` for Angular/Chromium and Node game coverage, or `yarn test:coverage:tools` for tooling coverage. Coverage is opt-in locally; ordinary test commands stay available. Both coverage commands keep the existing strict typechecks.

Open `coverage/game/index.html` and `coverage/tooling/index.html` for source-level reports. Each directory also contains `lcov.info`, `coverage-final.json` and `coverage-summary.json`. `yarn coverage:report` regenerates both reports from the collected inputs and prints a table of lines, statements, functions and branches, including covered/total counts. It fails if a required suite's input is missing or invalid. Group coverage commands clear that group's old inputs and reports before testing; each Vitest collection also cleans its own output.

Game coverage measures maintained TypeScript under `src`, including untested files. Browser and Node results merge by source location. The merger aligns class-field lowering and source ranges across Angular/esbuild and Vite/Oxc, keeps untouched placeholders separate from measured maps, and attributes Angular development replacements to the files actually executed. Tooling coverage measures scene/world tools, architecture and documentation checks, lint rules, coverage/reporting and test infrastructure, shared tooling helpers, the ESLint configuration and the production dependency auditor. Untested in-scope tooling also counts as uncovered. The [shared coverage configuration](../tools/coverage/config.ts) owns the exact includes and exclusions.

Test source files are excluded from coverage totals wherever they live; their execution contributes coverage for the production modules they exercise. Fixtures, test doubles, declaration files and generated scene registries are also excluded. Benchmark laboratories, the Editor MCP plugin and standalone art utilities do not enter the tooling total. Browser acceptance and development workflow checks run independently without collection. Reports measure TypeScript execution; templates, styles, native WASM internals and third-party packages are outside these totals.

Normal CI collects coverage during its existing test runs, prints separate Game and Tooling rows in the logs and Actions run summary, and retains separate report artifacts for seven days. Coverage is informational: no minimum percentages, regression gates or external coverage service are configured. Historical comparisons are not part of these reports.

## Browser acceptance

Built-worker acceptance requires a fresh production build and Playwright's installed Chromium:

```sh
yarn build --stats-json
yarn test:acceptance
```

The [production acceptance probe](acceptance/production-browser.ts) checks the worker URL under a non-root base path, same-origin CSP, movement, menu pause, crash/Retry and teardown. Results remain in ignored `tmp/production-worker-browser/`.

These additional probes require a running development application and Angular's development debug access:

```sh
yarn dev --port 4200
# In another terminal:
node tests/acceptance/check-migration-browser.ts http://localhost:4200 tmp/migration-browser
node tests/acceptance/check-turning-browser.ts http://localhost:4200 tmp/turning-browser
node tests/acceptance/rapier-browser.ts http://localhost:4200 tmp/rapier-browser
```

The migration probe covers keyboard/mouse flows, controls, placement, resizing and axe checks at two device-pixel ratios. The turning probe verifies animation/heading behavior and captures visual evidence. Passing an explicit output directory keeps fresh turning evidence separate from the existing art records.

The Rapier probe exercises the authored physics fixture through real keyboard input: one worker, falling/stacked objects, a kinematic moving block, pushing a dynamic crate, collision drawings, menu pause/resume and AXE. A spawn-only browser fixture checks that an idle player beside the blue mover stays detached through a round trip and can walk away. The Node physics suite covers all four mover sides, pushing without pulling, supported riding/walking off, native dynamic-body interactions, exact capture/rebuild continuation beside/on the platform, 1,000-step contact continuation, sparse quaternion transport, sleeping-body publication and disposal. Version-3 captures require native physics state; test setup that deliberately edits physical initial conditions uses `tools/testing/rebuild-physics.ts`.

## Audit of tests previously under tools

Audited 1 November 2026 by the implementation exercised and the assertions made, rather than the test filename. Six Node suites and three game acceptance probes moved out of `tools/`; compiler/export, tooling infrastructure and laboratory checks remain with their owners.

| Previous path                             | Current game-test location                                                     | Behavior exercised                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `tools/world/game-session.test.ts`        | [src/session/game-session.test.ts](../src/session/game-session.test.ts)                   | Scheduling, command ordering/cancellation, asynchronous restoration and exactly-once continuation. |
| `tools/world/worker-port.test.ts`         | [src/session/worker-port.test.ts](../src/session/worker-port.test.ts)                     | Production worker transport, errors/timeouts, disposal and failure delivery.                       |
| `tools/world/ecs-foundation.test.ts`      | [src/simulation/ecs-runtime.test.ts](../src/simulation/ecs-runtime.test.ts)         | Production ECS/domain rules, capture/rebuild, publication/inspection and session integration.      |
| `tools/world/simulation.test.ts`          | [src/simulation/simulation.test.ts](../src/simulation/simulation.test.ts)                 | Coordinates, initialization, movement, collision, pause and placement.                             |
| `tools/world/reference.test.ts`           | [src/simulation/reference.test.ts](../src/simulation/reference.test.ts)                   | Production movement/placement equivalence with an independent plain-object oracle.                 |
| `tools/world/world-geometry.test.ts`      | [src/simulation/world-geometry.test.ts](../src/simulation/world-geometry.test.ts)         | Live occupancy and safe snapshot geometry restoration.                                             |
| `tools/world/production-browser.ts`       | [acceptance/production-browser.ts](acceptance/production-browser.ts)           | Built application/worker integration and lifecycle.                                                |
| `tools/scenes/check-migration-browser.ts` | [acceptance/check-migration-browser.ts](acceptance/check-migration-browser.ts) | Development game UI, input, movement, placement and accessibility.                                 |
| `tools/art/check-turning-browser.ts`      | [acceptance/check-turning-browser.ts](acceptance/check-turning-browser.ts)     | Character animation and heading behavior in the real game.                                         |

Session and simulation suites are now colocated under `src/`; the cross-suite oracle, world fixture and strict oracle configuration stay in [support/](support/). Tooling and laboratory suites remain under `tools/` and now use Vitest:

| Tool tests                                                                                    | Reason and execution                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `tools/world/compile.test.ts`, `verify-export.test.ts`                                        | Marker compilation and exported-file validation; `test:tools` or focused `test:world`.                                |
| `tools/scenes/retain-assets.test.ts`, `workflow.test.ts`                                      | Retention, export staging/rollback, watchers and recovery; `test:tools` or focused `test:export`.                     |
| `tools/eslint/eslint-config.test.ts`, `explicit-member-accessibility.test.ts`                 | ESLint configuration and rule implementation; `test:tools` or focused `test:lint`.                                    |
| [tools/coverage/report.test.ts](../tools/coverage/report.test.ts) | Source-map normalization, merging, exclusions, malformed inputs, stale-data cleanup and reports; `test:tools`. |
| [tools/testing/typescript-resolution.test.ts](../tools/testing/typescript-resolution.test.ts) | Tests Vitest source-alias and native-package resolution; `test:tools`.                                  |
| [tools/ecs-bench/verify-production.test.ts](../tools/ecs-bench/verify-production.test.ts)     | Tests build-metadata auditing, moved beside the audit tool from `tools/world/production-audit.test.ts`; `test:tools`. |
| `tools/ecs-bench/protocol.test.ts`                                                            | Synthetic laboratory fixtures, scheduling, statistics and report/resume handling; opt-in ECS investigation checks.    |
| `tools/simulation-worker-bench/protocol.test.ts`, `presentation.test.ts`                      | Laboratory protocol/credits and prototype wire codec; opt-in worker investigation checks.                             |

`tools/scenes/check-dev-workflow.ts` remains a tooling integration check because it tests exporter/watcher reload and recovery. `tools/scenes/profile-browser.ts` remains a profiling/asset-audit tool; its application sanity assertions guard the measurements. Benchmark correctness drivers remain with their laboratories. These are distinct from the three relocated game acceptance probes.

Normal CI runs coverage-enabled tooling, Node game and Chromium application suites, followed by `test:acceptance` and the independent workflow checks. `yarn test:labs` runs only the opt-in laboratory unit suites through Vitest; it launches no performance trials. Laboratory performance trials retain their explicit opt-in workflows.
