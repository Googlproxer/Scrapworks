# Game tests

Game suites sit beside their production modules. `src/**/*.test.ts` suites run in Vitest's Node environment; `src/**/*.spec.ts` suites run through Angular in Chromium. This directory holds shared fixtures, the independent simulation oracle and browser acceptance probes that span multiple systems.

| Location                              | Scope                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/session/](../src/session/)       | Host scheduling, commands/capture continuation, completed hooks, worker transport and failure lifecycle.                                        |
| [src/simulation/](../src/simulation/) | Authoritative movement, placement/collision, ECS storage/publication, inventory/work primitives, snapshot validation and reference equivalence. |
| [support/](support/)                  | Plain world fixtures and the independent simulation oracle.                                                                                     |
| [acceptance/](acceptance/)            | Real application flows against built or running development applications.                                                                       |

## Commands

Run from the repository root with the pinned Node and Yarn versions.

```sh
yarn test:game
yarn test:game src/session
yarn test:game src/simulation
```

`test:game` strictly typechecks these suites and the independent oracle before running the Node tests. It requires neither scene export nor a browser. Vitest runs these suites in its real Node environment with file isolation, real timers and automatic mock restoration. Vite resolves source aliases from the repository's TypeScript configuration; no native Node loader or Angular test setup is needed. The plain [world fixture](support/world-fixture.ts) uses gameplay metres and keeps session/simulation tests independent of Editor marker compilation.

Foundation tests exercise actual opening commands and production player/deposit/pile schemas. Detached packet fixtures cover growth/malformed transport without arbitrary simulation mutation hooks. Shared inline controls live under `tools/testing`; current-game benchmark captures belong to [tools/game-bench](../tools/game-bench/README.md).

Save regressions include reordered JSON object members with exact native continuation, publication-independent dirty tracking, and isolated malformed metadata with healthy history/export and transactional cleanup. The controller confirmation integration uses the real runtime, session, CDK dialogs and UI adapter with a controlled client action port: cancellation/confirmation and stacked-menu focus remain usable while authority is held. Catalogue-wide toolbar tests cover visible labels and narrow-layout anchors. Restoration fixtures preserve idle, pollution-only, capped and order-independent outcomes; performance measurements remain local/manual.

[Physics boundary regressions](../src/simulation/physics/physics-boundaries.test.ts) cover native/ECS configuration disagreement without replacing the active world, terrain/entity identity separation, elevated salvage overflow capture/continuation/pickup, and independent presentation collection invalidation. Native corruption fixtures edit detached bytes through Rapier's public API; they add no simulation mutation hooks. The renderer ground-item tests cover elevation, stable meshes, removal and skipped scans for unchanged arrays.

## Waiting for asynchronous work

Browser and Node suites, tooling tests, opt-in laboratory tests and acceptance probes were
audited together for readiness polling. Subscribe before triggering an action when it can
complete synchronously. Use the operation's promise, Angular signal/stability notifications,
client lifecycle stream, focus event, worker reply or completed renderer frame as appropriate.
The [state wait helpers](../src/testing/wait-for-state.ts) fail on unexpected terminal client
states and release one-shot subscriptions. Regression tests cover synchronous re-entry,
failure, completion and teardown.

The [acceptance event helpers](acceptance/browser-events.ts) observe DOM mutations, completed
engine frames and real worker request/reply exchanges. Worker activity acknowledgements are
matched by request ID before pause checks; either listener can run first. These diagnostics
exist only in the probe's browser/worker context. Success does not depend on an interval or
sleep. Test-runner limits and standalone-probe watchdogs remain failure bounds for missing
events, with listener cleanup on success, failure and renderer disposal.

Time remains explicit where it is the behavior under test:

- Notification expiry and worker transport timeout tests advance fake timers.
- Session backpressure uses a controlled transport gate and the session's settled promise.
- Zero-delay task barriers drain Babylon's deferred observer removal and RxJS error reporting.
- Walk/sprint speed samples, brief turning taps and recording windows, winding gesture cadence,
  keyboard repeat suppression, deliberate render stalls and relaxed opening pacing retain
  their measured durations. They do not stand in for readiness signals.
- Opening virtual-time mode advances bounded clock batches and yields to worker evaluation;
  real-time opening waits are driven by worker replies. Deterministic simulation tests step
  the simulation directly.
- Laboratory correctness probes that test the autonomous worker clock and cancellation of
  deliberately delayed work retain observation windows. Benchmark sampling durations and
  performance-run watchdogs retain their measurement contracts.

Playwright locator actionability and document/navigation events remain appropriate for UI
and loading assertions. Negative pause/reload assertions observe an acknowledged boundary
followed by subsequent renderer frames; a finite observation does not prove indefinite absence.

## Research tree and machine-inspection smoke check

After a production build with `--stats-json`, run `node tests/acceptance/research-inspection-browser.ts` locally. It creates an explicitly prepared save with a nearby powered recycler, then checks new-game research defaults, prerequisite colours/gates, nearby keyboard/click inspection, live production with blocked movement, shared inventory-slot buffers, desktop/mobile AXE and save/reload. Screenshots and a receipt are written under ignored `tmp/research-inspection-browser/`. This is a local manual diagnostic and refuses CI; it is not an earned gameplay playthrough.

## Coverage

`yarn test:coverage` runs the normal tooling suites plus both game environments and creates two reports. Use `yarn test:coverage:game` for Angular/Chromium and Node game coverage, or `yarn test:coverage:tools` for tooling coverage. Coverage is opt-in locally; ordinary test commands stay available. Both coverage commands keep the existing strict typechecks.

Open `coverage/game/index.html` and `coverage/tooling/index.html` for source-level reports. Each directory also contains `lcov.info`, `coverage-final.json` and `coverage-summary.json`. `yarn coverage:report` regenerates both reports from the collected inputs and prints a table of lines, statements, functions and branches, including covered/total counts. It fails if a required suite's input is missing or invalid. Group coverage commands clear that group's old inputs and reports before testing; each Vitest collection also cleans its own output.

Game coverage measures maintained TypeScript under `src`, including untested files. Browser and Node results merge by source location. The merger aligns class-field lowering and source ranges across Angular/esbuild and Vite/Oxc, keeps untouched placeholders separate from measured maps, and attributes Angular development replacements to the files actually executed. Tooling coverage measures scene/world tools, architecture and documentation checks, lint rules, coverage/reporting and test infrastructure, shared tooling helpers, the ESLint configuration and the production dependency auditor. Untested in-scope tooling also counts as uncovered. The [shared coverage configuration](../tools/coverage/config.ts) owns the exact includes and exclusions.

Test source files are excluded from coverage totals wherever they live; their execution contributes coverage for the production modules they exercise. Fixtures, test doubles, declaration files and generated scene registries are also excluded. Benchmark laboratories, the Editor MCP plugin and standalone art utilities do not enter the tooling total. Browser acceptance and development workflow checks run independently without collection. Reports measure TypeScript execution; templates, styles, native WASM internals and third-party packages are outside these totals.

Normal CI collects coverage during its existing test runs, prints separate Game and Tooling rows in the logs and Actions run summary, and retains separate report artifacts for seven days. Coverage is informational: no minimum percentages, regression gates or external coverage service are configured. Historical comparisons are not part of these reports.

## Browser acceptance

**CI runtime budget:** virtual and full gameplay playthroughs must never run in CI/GitHub Actions. Opening/factory routes, accelerated-clock variants and the prepared factory-controls route are local, manually invoked diagnostics only. The user cannot afford their hosted-runner time. Use focused unit/component tests and fixture-based integration checks in CI; see [AGENTS.md](../AGENTS.md#ci-runtime-budget).

Built-worker acceptance requires a fresh production build and Playwright's installed Chromium:

```sh
yarn build:prod:stats
yarn test:acceptance
```

The [production acceptance probe](acceptance/production-browser.ts) checks the worker URL under a non-root base path, same-origin CSP, movement, menu pause, crash/Retry and teardown. Results remain in ignored `tmp/production-worker-browser/`.

For the primary Firefox engine, append `--firefox` to `production-browser.ts`, `save-browser.ts` (including `--research`) or `opening-browser.ts`. Firefox receipts use a separate `firefox/` output directory. Chromium-specific CDP loading/throttle checks are explicitly skipped in Firefox; its normal renderer/worker/storage/input path still runs. Append `--headed` to the opening route for a visible hardware-rendered local check. The defaults and existing CI scope are unchanged.

The local-only [portfolio diagnostic](../tools/portfolio/run.ts) provides three warmed 30-second samples, twelve UI save/load observations, real autosave observation, controlled workload fixtures and shareable hardware/build/asset metadata for Chromium/Firefox. Its `--save` option accepts an earned current-map checkpoint without grants; provenance remains separate. See the [portable protocol and limits](../docs/portfolio/README.md#portable-browser-and-hardware-diagnostic). Neither this diagnostic nor any full/virtual gameplay route belongs in CI.

`yarn test:factory` extends the built empty-handed opening through paid factory research, equipment assembly, physical placement/wiring, mixed recycling, Basic/Medium production and two supplied shared-queue labs, then Save/page reload/Continue and desktop/mobile AXE. It uses Playwright's virtual clock and real physical-key/UI input, with no production mutation API, resource grants or injected saves. Timing is functional evidence, not a human pacing measurement. Results are in `tmp/factory-browser/`.

`yarn test:restoration` continues the earned opening/factory/transport route into paid storage/water/greenhouse research, the 20 by 20 map's lake, pipes/overflow, a coal-free all-cell health checkpoint, optional coal/mitigation, pollution/recovery, filled-infrastructure dismantling and Save/reload/Continue with desktop/mobile AXE. It is a local/manual full gameplay diagnostic and must never enter CI. Its TypeScript route is [restoration-route.ts](acceptance/restoration-route.ts); receipts are in `tmp/transport-browser/`. `--resume-transport=<earned-M6-save.json> --restoration` resumes the M7/M8 route. `--resume-restoration=<earned-M7-save.json>` continues directly into M8 after the saved factory/transport checkpoint, explicitly reporting the resume rather than claiming a new empty-handed run. Both require the exact current map. No resource/research grants are used. Reload replaces the diagnostic's observed worker handle as well as the game's worker.

`node tools/restoration-bench.ts <earned-M8-save.json>` profiles 2,500 fixed steps and publications, capture/rebuild and 1,000-step exact branch continuation on a detached earned world. It rejects CI/GitHub Actions. Results are local under `tmp/restoration-bench/`; this is compute profiling, not a target-device frame-rate or human pacing qualification.

Append `--frontier` after the input/output paths to profile a controlled fixture with health reset to zero on that earned layout. It grants no stock or research, changes no authored map and records the fixture variation explicitly. Use it to stress active frontier propagation and changing lake quality; it is not evidence of an earned gameplay route.

For a dedicated empty-handed M8 route, use `node tests/acceptance/opening-browser.ts --virtual-time --restoration-direct`. It earns the prerequisite technology chain and builds the renewable/restoration layout using Field Research, without repeating M7's conveyor acceptance. It retains the same paid green/coal, recovery and save assertions. Receipts identify it as a dedicated restoration route; it is also guarded against CI.

For a faster UI diagnostic, `node tests/acceptance/save-browser.ts --factory-controls` runs the same industrial/control section from an explicitly prepared test save. That mode grants equipment only in isolated fixture setup; its receipt identifies `preparedFixture` and does not claim an empty-handed route. The [factory invariant tests](../src/simulation/factory.test.ts) cover bounded random yields, partial power, whole recovery and simultaneous factory/native/research continuation. Manual performance runs use `node tools/factory-bench.ts` and remain outside CI.

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

| Previous path                             | Current game-test location                                                        | Behavior exercised                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `tools/world/game-session.test.ts`        | [src/session/game-session.test.ts](../src/session/game-session.test.ts)           | Scheduling, command ordering/cancellation, asynchronous restoration and exactly-once continuation. |
| `tools/world/worker-port.test.ts`         | [src/session/worker-port.test.ts](../src/session/worker-port.test.ts)             | Production worker transport, errors/timeouts, disposal and failure delivery.                       |
| `tools/world/ecs-foundation.test.ts`      | [src/simulation/ecs-runtime.test.ts](../src/simulation/ecs-runtime.test.ts)       | Production ECS/domain rules, capture/rebuild, publication/inspection and session integration.      |
| `tools/world/simulation.test.ts`          | [src/simulation/simulation.test.ts](../src/simulation/simulation.test.ts)         | Coordinates, initialization, movement, collision, pause and placement.                             |
| `tools/world/reference.test.ts`           | [src/simulation/reference.test.ts](../src/simulation/reference.test.ts)           | Production movement/placement equivalence with an independent plain-object oracle.                 |
| `tools/world/world-geometry.test.ts`      | [src/simulation/world-geometry.test.ts](../src/simulation/world-geometry.test.ts) | Live occupancy and safe snapshot geometry restoration.                                             |
| `tools/world/production-browser.ts`       | [acceptance/production-browser.ts](acceptance/production-browser.ts)              | Built application/worker integration and lifecycle.                                                |
| `tools/scenes/check-migration-browser.ts` | [acceptance/check-migration-browser.ts](acceptance/check-migration-browser.ts)    | Development game UI, input, movement, placement and accessibility.                                 |
| `tools/art/check-turning-browser.ts`      | [acceptance/check-turning-browser.ts](acceptance/check-turning-browser.ts)        | Character animation and heading behavior in the real game.                                         |

Session and simulation suites are now colocated under `src/`; the cross-suite oracle, world fixture and strict oracle configuration stay in [support/](support/). Tooling and laboratory suites remain under `tools/` and now use Vitest:

| Tool tests                                                                                    | Reason and execution                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `tools/world/compile.test.ts`, `verify-export.test.ts`                                        | Marker compilation and exported-file validation; `test:tools` or focused `test:world`.                                |
| `tools/scenes/retain-assets.test.ts`, `workflow.test.ts`                                      | Retention, export staging/rollback, watchers and recovery; `test:tools` or focused `test:export`.                     |
| `tools/eslint/eslint-config.test.ts`, `explicit-member-accessibility.test.ts`                 | ESLint configuration and rule implementation; `test:tools` or focused `test:lint`.                                    |
| [tools/coverage/report.test.ts](../tools/coverage/report.test.ts)                             | Source-map normalization, merging, exclusions, malformed inputs, stale-data cleanup and reports; `test:tools`.        |
| [tools/testing/typescript-resolution.test.ts](../tools/testing/typescript-resolution.test.ts) | Tests Vitest source-alias and native-package resolution; `test:tools`.                                                |
| [tools/ecs-bench/verify-production.test.ts](../tools/ecs-bench/verify-production.test.ts)     | Tests build-metadata auditing, moved beside the audit tool from `tools/world/production-audit.test.ts`; `test:tools`. |
| `tools/ecs-bench/protocol.test.ts`                                                            | Synthetic laboratory fixtures, scheduling, statistics and report/resume handling; opt-in ECS investigation checks.    |
| `tools/simulation-worker-bench/protocol.test.ts`, `presentation.test.ts`                      | Laboratory protocol/credits and prototype wire codec; opt-in worker investigation checks.                             |

`tools/scenes/check-dev-workflow.ts` remains a tooling integration check because it tests exporter/watcher reload and recovery. `tools/scenes/profile-browser.ts` remains a profiling/asset-audit tool; its application sanity assertions guard the measurements. Benchmark correctness drivers remain with their laboratories. These are distinct from the three relocated game acceptance probes.

Normal CI runs coverage-enabled tooling, Node game and Chromium application suites, followed by `test:acceptance`, `test:saves` and the independent workflow checks. `yarn test:labs` runs only the opt-in laboratory unit suites through Vitest; it launches no performance trials. Laboratory performance trials retain their explicit opt-in workflows.
