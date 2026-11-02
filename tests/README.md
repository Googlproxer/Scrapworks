# Game tests

Game behavior tests have two execution environments. Browser-based Angular and Babylon suites stay beside their source as `src/**/*.spec.ts`. Plain Node suites and browser acceptance entry points live here, grouped by the code they exercise.

| Location                   | Scope                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [session/](session/)       | Host scheduling, commands/capture continuation, completed hooks, worker transport and failure lifecycle.                                        |
| [simulation/](simulation/) | Authoritative movement, placement/collision, ECS storage/publication, inventory/work primitives, snapshot validation and reference equivalence. |
| [support/](support/)       | Plain world fixtures and the independent simulation oracle.                                                                                     |
| [acceptance/](acceptance/) | Real application flows against built or running development applications.                                                                       |

## Commands

Run from the repository root with the pinned Node and Yarn versions.

```sh
yarn test:game
node --test tests/session/*.test.ts
node --test tests/simulation/*.test.ts
```

`test:game` strictly typechecks these suites and the independent oracle before running the Node tests. It requires neither scene export nor a browser. Each source test imports the shared [TypeScript resolver](../tools/testing/register-typescript.ts) before loading game modules; source aliases follow the repository's TypeScript configuration. The plain [world fixture](support/world-fixture.ts) uses gameplay metres and keeps session/simulation tests independent of Editor marker compilation.

Foundation tests exercise actual opening commands and production player/deposit/pile schemas. Detached packet fixtures cover growth/malformed transport without arbitrary simulation mutation hooks. Shared inline controls live under `tools/testing`; current-game benchmark captures belong to [tools/game-bench](../tools/game-bench/README.md).

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
```

The migration probe covers keyboard/mouse flows, controls, placement, resizing and axe checks at two device-pixel ratios. The turning probe verifies animation/heading behavior and captures visual evidence. Passing an explicit output directory keeps fresh turning evidence separate from the existing art records.

## Audit of tests previously under tools

Audited 1 November 2026 by the implementation exercised and the assertions made, rather than the test filename. Six Node suites and three game acceptance probes moved out of `tools/`; compiler/export, tooling infrastructure and laboratory checks remain with their owners.

| Previous path                             | Current game-test location                                                     | Behavior exercised                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `tools/world/game-session.test.ts`        | [session/game-session.test.ts](session/game-session.test.ts)                   | Scheduling, command ordering/cancellation, asynchronous restoration and exactly-once continuation. |
| `tools/world/worker-port.test.ts`         | [session/worker-port.test.ts](session/worker-port.test.ts)                     | Production worker transport, errors/timeouts, disposal and failure delivery.                       |
| `tools/world/ecs-foundation.test.ts`      | [simulation/ecs-foundation.test.ts](simulation/ecs-foundation.test.ts)         | Production ECS/domain rules, capture/rebuild, publication/inspection and session integration.      |
| `tools/world/simulation.test.ts`          | [simulation/simulation.test.ts](simulation/simulation.test.ts)                 | Coordinates, initialization, movement, collision, pause and placement.                             |
| `tools/world/reference.test.ts`           | [simulation/reference.test.ts](simulation/reference.test.ts)                   | Production movement/placement equivalence with an independent plain-object oracle.                 |
| `tools/world/world-geometry.test.ts`      | [simulation/world-geometry.test.ts](simulation/world-geometry.test.ts)         | Live occupancy and safe snapshot geometry restoration.                                             |
| `tools/world/production-browser.ts`       | [acceptance/production-browser.ts](acceptance/production-browser.ts)           | Built application/worker integration and lifecycle.                                                |
| `tools/scenes/check-migration-browser.ts` | [acceptance/check-migration-browser.ts](acceptance/check-migration-browser.ts) | Development game UI, input, movement, placement and accessibility.                                 |
| `tools/art/check-turning-browser.ts`      | [acceptance/check-turning-browser.ts](acceptance/check-turning-browser.ts)     | Character animation and heading behavior in the real game.                                         |

The oracle and its strict configuration moved from `tools/world/` to [support/](support/) with the tests that own them. The following eleven Node test files test tooling and remain under `tools/`:

| Tool tests                                                                                    | Reason and execution                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `tools/world/compile.test.ts`, `verify-export.test.ts`                                        | Marker compilation and exported-file validation; `test:tools` or focused `test:world`.                                |
| `tools/scenes/retain-assets.test.ts`, `workflow.test.ts`                                      | Retention, export staging/rollback, watchers and recovery; `test:tools` or focused `test:export`.                     |
| `tools/eslint/eslint-config.test.ts`, `explicit-member-accessibility.test.ts`                 | ESLint configuration and rule implementation; `test:tools` or focused `test:lint`.                                    |
| [tools/testing/typescript-resolution.test.ts](../tools/testing/typescript-resolution.test.ts) | Tests the shared import resolver, moved beside it from `tools/world/`; `test:tools`.                                  |
| [tools/ecs-bench/verify-production.test.ts](../tools/ecs-bench/verify-production.test.ts)     | Tests build-metadata auditing, moved beside the audit tool from `tools/world/production-audit.test.ts`; `test:tools`. |
| `tools/ecs-bench/protocol.test.ts`                                                            | Synthetic laboratory fixtures, scheduling, statistics and report/resume handling; opt-in ECS investigation checks.    |
| `tools/simulation-worker-bench/protocol.test.ts`, `presentation.test.ts`                      | Laboratory protocol/credits and prototype wire codec; opt-in worker investigation checks.                             |

`tools/scenes/check-dev-workflow.ts` remains a tooling integration check because it tests exporter/watcher reload and recovery. `tools/scenes/profile-browser.ts` remains a profiling/asset-audit tool; its application sanity assertions guard the measurements. Benchmark correctness drivers remain with their laboratories. These are distinct from the three relocated game acceptance probes.

Normal CI runs `test:tools`, `test:game`, the existing Chromium application suites and `test:acceptance`. Laboratory tests and performance trials retain their explicit opt-in workflows.
