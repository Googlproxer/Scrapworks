# Game data preloading implementation plan

Recorded 10 November 2026. Status: **implemented and locally validated against the current worker architecture**. A separate agent is running the [split physics worker experiment](split-physics-worker-experiment.md) and will reconcile the preload changes with its results. This work makes no final decision about the future worker architecture.

## Agreed behavior

The user selected both implementation choices on 10 November:

- Warm Rapier and download reusable asset bytes while the main menu is displayed. Parse the character and game scene only after New Game or Continue is selected.
- Show a small, non-blocking readiness status in reserved menu space.

Start automatically after the main menu is interactive and its first frame has been drawn. New Game, Continue, Controls and Inspector retain their normal availability while background work is pending. An immediate selection adopts unfinished work rather than starting duplicate loads. No playable world, simulation ticks or autosaves start merely because the menu is open.

The scope is startup and world-loading latency. Keep the existing physics engine, gameplay clock, controller/interpolation behavior, save format and authored assets. The worker readiness/adoption design below targets the current single-worker reference; reconciliation with any accepted split-worker design belongs to the experiment agent. Externalizing Rapier WASM and narrowing Babylon dependencies remain separate investigations.

## Parallel experiment and reconciliation

Both efforts proceed independently. Keep source-data caching and menu status independent of the number or kind of workers. Isolate bootstrap readiness, worker acquisition and ownership transfer behind the session composition boundary so reconciliation does not require rewriting the character cache or UI around specific worker filenames.

The preload implementation handoff must identify the source/build versions, ready-versus-world-initialized semantics, acquisition/validation purposes, lease ownership, generation/cancellation rules, worker counts and timing results. The experiment agent owns reconciling those contracts and changes with the measured architecture result, including any necessary baseline reruns and integration checks. Do not combine measurements from different preload policies/builds as if they were the same baseline.

This coordination does not pause the experiment or predetermine its outcome. Its agent maintains experiment progress and results; the startup work retains a clear current-architecture reference for comparison.

## Current loading and intended overlap

Before this change, the first New Game loaded the game scene, fetched/validated the world definition, initialized the simulation worker and Rapier, then loaded the character and prepared presentation. Continue prepared its candidate simulation before beginning candidate presentation. See [scene loading](../../src/game/babylon-game-client.ts), [world replacement](../../src/app/features/game/game-runtime.service.ts) and [session ownership](../../src/app/features/game/game-session-owner.ts).

The intended flow is:

1. Draw the usable main menu.
2. In the background, warm one uninitialized-world simulation worker, download the character GLB and fetch/validate the authored world definition.
3. On New Game/Continue, claim the warmed worker when eligible and prepare the chosen simulation in parallel with game-scene loading and character parsing.
4. Join those preparations before attaching gameplay presentation/scripts. Prepare the UI, draw the first game frame and commit through the existing activation boundary.

Preloading moves work into menu time and overlaps independent tasks. Total asset size is unchanged. Character decoding, texture upload, shader compilation and final scene preparation remain foreground work in this version.

### Resource policy

| Resource                                   | Menu work                                                                                             | Foreground reuse                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Simulation worker/runtime/Rapier           | Create one worker and await runtime/Rapier bootstrap readiness, without sending world initialization. | Transfer ownership of the same worker port to the first eligible activating GameSession.           |
| Character GLB                              | Fetch and retain the binary source through one shared promise.                                        | Load Babylon's AssetContainer from those bytes in the actual candidate scene.                      |
| Authored world JSON                        | Fetch, validate and retain a detached definition for the current resource generation.                 | Supply the new/candidate simulation after the existing authored-map and save compatibility checks. |
| Game `.babylon` scene and its dependencies | Defer to selection in this implementation.                                                            | Load through the existing Editor runtime while simulation preparation runs independently.          |
| Save payload                               | Keep the current metadata listing; do not activate or initialize a saved run during menu preload.     | Read the selected revision and validate it through the existing save flow.                         |

The installed Editor `loadScene(rootUrl, filename, ...)` entry point accepts a URL filename and has no byte-source parameter. Speculatively downloading that same scene and then invoking its URL loader would not establish reliable reuse. Do not introduce a global file-loader override, service worker, persistent browser cache or a replacement Editor loader merely to preload the small scene file. Its download and parsing still overlap simulation work after selection. The character loader already supports an explicit binary-source integration through Babylon's LoadAssetContainerAsync.

## 1. Establish ownership and resource state

Add a game-page-lifetime resource owner in the application layer, composed by GameRuntimeService. It owns one character source promise/buffer, one validated definition generation, cancellation and readonly preload status. Keep native worker ownership with GameSessionOwner or a small collaborator owned by it.

The renderer receives typed resource readers through the [main-thread client API](../../src/game/client-api.ts). The resource owner must not import Babylon runtime modules, Rapier or Simulation into Angular's static UI graph, and the renderer must not import Angular services. Keep deterministic simulation/contracts free of fetching, DOM, wall-clock and reactive-library dependencies.

Use explicit resource states such as not-started, loading, ready and failed, with a separate claimed/disposed state for worker ownership. UI status is derived from those states. Do not overload GameState.loading, GameRuntimeService.isBusy, modal input suspension or the existing full-screen loading stream with background work.

Cache complete character bytes and the validated definition for the current game-page lifetime so renderer Retry and subsequent loads can reuse source data. Bound retention to one current copy of each; never retain a sequence of worlds or parsed character containers. Release references and abort owned downloads when the page/runtime is destroyed.

Key resource generations by resolved base/resource URL and the running export/build generation. A reload, development export/HMR update, base-URL change or explicit invalidation must discard stale definitions/source promises. Preserve current authored-map identity validation on save activation/import. If a cached definition cannot be proven to belong to the current resource generation, re-fetch the small JSON before that validation; do not let a warm cache authorize a stale map. Registration-feature hashes alone do not prove asset-content identity.

Define cancellation per owner: canceling one scene preparation stops that consumer's wait and invalidates its callbacks, while a page-owned source request may still serve another consumer. Renderer attachment generations remain distinct from resource generations and gameplay world generations.

## 2. Warm and adopt the existing worker

The [worker entry point](../../src/workers/simulation.worker.ts) already begins importing SimulationRuntime immediately; [Rapier initialization](../../src/simulation/physics/rapier.ts) occurs during that import. SimulationRuntime has no world until an initialize request arrives. Use this existing distinction.

Extend bootstrap observability with a typed ready/failure path that is separate from request/reply IDs. Readiness means the runtime and Rapier are initialized, not that a playable world exists. Preserve the early message/error boundary, validate bootstrap messages, bound bootstrap waiting and make disposal/failure settle readiness without unhandled rejections. Existing inline/fake ports must retain their appropriate behavior without pretending to initialize WASM.

Manage the idle worker as a single-use lease:

- Menu warming creates at most one idle port, including during repeated readiness notifications.
- Initial New Game or Continue atomically claims a ready or still-warming port. Foreground initialization awaits the remaining readiness work; it does not create a second worker to replace successful background work.
- Once claimed, the GameSession owns disposal. The preload owner cannot terminate a healthy active session during renderer Retry or teardown of a stale preload callback.
- A failed/disposed idle port is discarded. A foreground request can make one normal acquisition attempt, then use the existing visible error/Retry path if it fails. No uncontrolled background retry loop.
- Do not replenish an idle worker while a live game session exists. Existing world replacement keeps its fresh candidate-worker behavior; it never reuses or overwrites the active worker's authority.
- Temporary import/export validation via validateForSave must not accidentally consume the activation lease. Distinguish acquisition purposes at the composition boundary and preserve existing bounded candidate lifetimes.

Do not warm Rapier on the main thread or create a disposable warmup worker followed by another gameplay worker. The measured benefit must come from using the warmed runtime instance. No initialize, advance, capture, run-ID creation or save write is part of background warming.

## 3. Reuse downloaded source bytes

Refactor [character loading](../../src/game/assets/load-character.ts) to accept the shared binary source while preserving scene ownership, loader registration, `.glb` plugin selection, progress and base-URL handling. Preserve the original resource URL/name for any relative-resource resolution; do not depend on a blob URL's directory semantics.

Treat source buffers as read-only cache data. Do not transfer/detach the retained buffer into the simulation worker or let a consumer mutate it. If a parser requires exclusive ownership, give it an explicit copy and account for that memory cost. Keep decoded meshes, materials, textures, skeletons and animation groups owned by their actual scene.

The fetch and foreground load must share one source promise when the user selects a game before downloading finishes. A failed background fetch remains non-blocking in the menu. Evict failed source state and allow one bounded foreground retry. If parsing proves retained bytes invalid, evict that entry so Retry does not repeatedly parse the same bad buffer.

Use an owned in-memory result rather than assuming a speculative fetch will populate a reusable HTTP cache. The local preview uses no-cache and the diagnostic server uses no-store; a second URL load can revalidate or download again. Preserve correct behavior with both policies and under a non-root hosting base path.

Validate the authored definition before publishing it to consumers. Keep consumer snapshots detached from the cached definition so world initialization or restore cannot mutate another consumer's initial data. Consolidate the currently separate authored-world readers without weakening assertWorldDefinition or assertSameAuthoredMap.

## 4. Parallelize preparation without concurrent scene mutation

Separate presentation asset preparation from binding a ready simulation to WorldScene. Use an owned, disposable preparation result, extending the existing [PreparedWorld](../../src/game/client-api.ts) boundary rather than publishing a partial world.

After selection, prepare independent branches:

| Simulation branch                                                     | Presentation branch                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Resolve the selected new/save world and required definition checks.   | Load the Game scene and its dependencies through the Editor loader.        |
| Acquire the eligible warm or normal candidate worker.                 | Parse the cached/in-flight character bytes into that candidate scene.      |
| Initialize/restore and await the candidate's first valid publication. | Retain the scene and character assets without activating gameplay scripts. |

Game-scene loading and character parsing can modify the same scene and active camera. Keep those mutations ordered: load the authored scene first, parse the character into it, then restore/verify the authored active camera. Their source downloads and worker initialization can overlap; do not replace the entire pipeline with an indiscriminate Promise.all on scene-mutating operations.

Once both branches succeed, construct/bind WorldScene against the ready candidate bridge, preserve restored crafting state, await rendering readiness and draw the first prepared frame. Commit presentation, simulation ownership and UI through the existing guarded boundary. A faster initialization reply alone is not completion.

If either branch fails or becomes stale, dispose every uncommitted result, including a sibling preparation that finishes later. Cancellation must not orphan a worker, parsed character, texture or scene. Keep the previous active session/presentation intact on a failed load, and retain existing fresh-input/focus behavior after successful activation.

Apply this to initial New Game, initial Continue and subsequent explicit world replacement. Reuse source bytes across those paths. Subsequent candidate workers still initialize Rapier normally while presentation assets are prepared in parallel; do not claim the one consumed menu lease warms every later worker.

## 5. Add the non-blocking menu status

Add compact status content to [the game-page template](../../src/app/features/game/game-page/game-page.component.html), with space reserved from the first menu render. Keep controls anchored at desktop and narrow/short viewport sizes. Scope the content to the main menu rather than the in-game pause dialog.

Use a signal-derived state and restrained polite status announcements for meaningful phase changes. Do not announce every received byte or steal focus. Suggested player-facing copy is "Preparing game data...", "Game data downloaded" and, after an optional preload failure, "Some data will load when you start". Final copy must distinguish downloaded data from a fully parsed/playable scene.

Background progress does not disable New Game/Continue, show a blocking overlay, trap focus or make the renderer inert. Once the player selects a game, retain the existing blocking loading/failure/Retry UX for required foreground work. Compose per-task progress truthfully when branches overlap; use indeterminate progress where totals or encoded-versus-decoded byte units are not reliable. Avoid a fabricated overall percentage.

Start warming only after the visible menu is usable. Repeated menu events are idempotent. Do not start new optional work while hidden; retain successful results and let already-owned requests settle or cancel according to the page lifetime. No gameplay time advances in the background.

## 6. Verify behavior and measure the actual improvement

Use focused unit/component and fixture-based browser integration checks. Keep full gameplay routes, timing comparisons, throttling experiments and long-running diagnostics local/manual, following the [CI budget](../../AGENTS.md#ci-runtime-budget).

### Focused correctness coverage

- One warm worker, one character source download and one shared in-flight definition request per valid generation, even after repeated menu notifications or an immediate click. Record explicit revalidation requests separately where identity requires them.
- Bootstrap ready/failure, timeout, disposal-before-ready, lease claim, foreground fallback, inline/fake ports and no-world/no-ticks/no-autosaves during menu dwell.
- Initial New Game and Continue adopt the same successful idle worker. Temporary save validation does not steal the lease; later candidate replacement never corrupts the active worker.
- Byte-source parsing preserves the correct scene/camera, skeletons, animations, resource URLs and base path. Source bytes survive renderer Retry, while scene-specific GPU resources do not leak across scenes.
- Background failures leave menu controls working. Foreground failure/retry can recover, invalid source bytes are evicted, cancellation disposes late sibling results, and a failed saved-world preparation preserves active state.
- Captures/continuation, authored-map checks, saved craft UI, input clearing and focus retain current behavior. Existing client storage is not migrated or cleared.
- AXE, keyboard/controller menu access, polite announcements and stable control positions across pending/ready/degraded status. Check narrow and short viewports and reduced motion.

Update [loading acceptance](../../tests/acceptance/loading-checks.ts) deliberately. Its current fault routes are installed after menu readiness; preloading could complete before those interceptors exist. Install relevant worker/GLB gates before navigation or before the preload trigger, exercise both delayed menu work and immediate selection, and prevent a warm cache from making delay/failure assertions vacuously pass. Cover the worker bootstrap and runtime chunk, not just a single filename.

### Local timing comparison

Freeze the current source/build and measure it with the same assets and hardware before implementation. Compare baseline and preload variants in Chromium and Firefox with cold/warm cache, realistic transfer throttling and CPU pressure, and both no-store and normal preview cache policies. Keep instrumentation identical and bounded.

Use menu dwell cohorts of immediate selection, 1, 3 and 10 seconds, plus an explicitly observed preload-complete case. The baseline gets the same dwell. Record actual resource completion rather than assuming a fixed wait means ready. Separate fresh-browser startup, repeated world loading and renderer Retry; do not mix their distributions.

Measure:

- Initial UI paint, main-menu first frame and time until menu controls are usable.
- Menu frame intervals/long tasks and input response while the downloads and worker bootstrap are active.
- **Actual New Game/Continue handler receipt to first playable rendered frame**, excluding automation actionability/setup. Track viewport focus and restored craft UI readiness where applicable.
- Worker fetch/import/WASM readiness, source transfer/body completion, scene loading, character parsing and the final preparation/commit join.
- Request counts and transferred/decoded bytes; worker identity across preload/adoption; retained source bytes, native/JS memory where observable, and resource counts after repeated Retry/load/disposal.

Do not sum overlapping stages into end-to-end latency. A faster worker bootstrap or cached download is useful only if click-to-play or another recorded user-facing boundary improves. No startup speedup is claimed until this comparison runs.

Qualification requires coherent saves/lifecycle, correct reuse and a usable menu throughout preload. The completed-preload cohorts must demonstrate a repeatable click-to-play improvement beyond measurement noise. Immediate-selection behavior must avoid a material regression from contention; initial menu availability and steady-state controller behavior must remain at baseline. Freeze numerical regression tolerances after baseline calibration and before candidate measurement, retaining per-browser results and failures. Existing normal frame/save/load gates remain in force; report incomplete hardware/memory observations explicitly.

## Implementation packages and handoff

1. Record the current startup baseline and add narrowly scoped timing/resource probes.
2. Add the page-owned source cache, invalidation/cancellation states and typed renderer resource readers.
3. Add worker bootstrap readiness and the single-use activation lease, with lifecycle tests.
4. Integrate cached character parsing and parallel simulation/presentation preparation, preserving the commit boundary.
5. Add the reserved-space menu status and focused accessibility/layout checks.
6. Update loading/failure fixtures, run the local before/after comparison and publish the measured outcome.

Use strict TypeScript for new application/tooling code and the repository's Angular/event-handling conventions. No dependency installation, asset replacement, persistent caching system, split-worker migration or save-schema migration is needed for the selected scope.

Keep measurements, traces and screenshots under ignored `docs/reports/data-preloading/<date>/`. Track durable implementation decisions and remaining limitations here. The two product choices are resolved; there are **no pending user questions** before implementation. Routine ownership, cancellation, protocol and test details are implementation responsibilities within this plan.

- [x] Capture the current menu and click-to-play baseline.
- [x] Implement shared source data, worker readiness and lease ownership.
- [x] Integrate foreground overlap and coherent activation/failure cleanup.
- [x] Add and verify the reserved non-blocking menu status.
- [x] Pass focused correctness, lifecycle, save, accessibility and layout checks.
- [x] Complete the local before/after measurements and record the outcome.

## Implemented ownership and experiment handoff

- [GameStartupResources](../../src/app/features/game/game-startup-resources.ts) owns source data for the game-page lifetime, independently of renderer attachments. Pending menu and foreground readers share requests. Failed fetches are evicted; a later required read retries. Character parse failures invalidate the bytes. Disposal/base-URL changes abort requests and suppress late publication. Character source bytes survive renderer Retry; parsed containers remain scene-owned.
- Definitions are detached per reader. Activation/import validation re-fetches settled JSON (or joins a still-pending request), so a warm definition cannot bypass current authored-map checks. A changed authored map evicts the character source. Production resource generations are bounded by page reload; successful Editor exports already trigger document reload in the development workflow. There is no persistent cache or separate asset-version manifest.
- [SimulationPort.warmup](../../src/session/port.ts) is optional for inline/fake ports. The real worker uses the separate version-1 [bootstrap envelope](../../src/contracts/worker-bootstrap.ts), without changing simulation protocol 2. `simulation-ready` means runtime module evaluation and Rapier initialization finished; it does not mean a world exists. Timeout/native worker failure uses the existing terminal failure boundary.
- [GameSessionOwner](../../src/app/features/game/game-session-owner.ts) owns one idle port. Activation claims the same instance, including unfinished bootstrap. Temporary validation creates its own port. Failed idle bootstrap disposes its port; foreground activation then creates a fresh one. Claiming removes the idle failure subscription and transfers failure/disposal responsibility to GameSession.
- Selection cancels the queued menu-paint preload and starts/joins the same source/worker work immediately for both New Game and Continue. The queued callback also checks whether selection already took ownership, so even an already-delivered callback cannot create an extra idle worker during candidate preparation.
- Initial activation starts the Editor scene branch alongside definition/simulation initialization, then parses the cached character into that scene. Saved-world preparation accepts a readiness promise in [GameClient.prepareWorld](../../src/game/client-api.ts), overlaps scene/character work with candidate simulation construction, and joins before attaching world scripts. Cancellation releases late sibling results. Initial activation still waits for the normal visible render loop; it never manufactures a hidden-tab first frame. Candidate preparation retains the existing synchronous presentation/session commit boundary and saved-craft UI preparation.
- The experiment agent should adapt the warmup/claim boundary to whichever worker owns Rapier after reconciliation, retain source-data ownership independently, and re-run worker identity, save/cancellation and latency checks. This implementation changes no physics stepping, controller, interpolation, gameplay clock or save schema.

The [local diagnostics](../../tools/preload/README.md) record build fingerprints, actual click receipt to software-playable readiness, source timings and worker adoption. Reports and screenshots remain ignored under `docs/reports/data-preloading/2026-11-10/`; they are not CI jobs or gameplay playthroughs.

## Local validation outcome

The matched production comparison contains 80 baseline and 80 candidate samples: Chromium 158.0.8127.18 and Firefox 159.0, five repetitions of New Game/Continue at 0/1/3/10-second menu dwells. New Game starts in a fresh browser context; Continue reloads a UI-created save in that context with a revalidating warm browser cache. Timing begins at actual click receipt and ends at software-playable readiness after the first frame and viewport focus.

Median click-to-play times after a 3-second menu dwell:

| Browser  | Operation | Baseline | Preload | Reduction |
| -------- | --------- | -------: | ------: | --------: |
| Chromium | New Game  |  1,202ms |   831ms |       31% |
| Chromium | Continue  |  1,042ms |   830ms |       20% |
| Firefox  | New Game  |  1,346ms | 1,113ms |       17% |
| Firefox  | Continue  |  1,225ms |   951ms |       22% |

Immediate-selection medians improved by 15–26% for New Game and about 19% for Continue. The 10-second dwell medians improved by 14–20%; longer dwell does not imply a proportionally larger gain. Every cohort passed the locally recorded median bounds for immediate-selection regression, 3s/10s improvement and menu availability. All samples completed without page errors. Where a worker already existed before selection, the same instance remained active afterward; all samples ended with one worker and one character-source request. Menu checks independently observed bootstrap readiness without world initialization, and exercised pending/ready/degraded status, byte reuse and Retry in both browsers.

Validation passed: 427 Angular/browser tests, 236 Node game/session tests, 94 tooling tests, development/production builds, strict type/lint checks, architecture/export/bundle checks, and Chromium/Firefox production save/loading/lifecycle/accessibility acceptance. The preload checks cover 320×240 and desktop menus, including all three saved-session actions. An explicit regression delivers the canceled menu callback after Continue has claimed its port, verifying it cannot create another idle worker.

These are bounded local headless measurements, not physical controller latency or full network/CPU/memory-pressure qualification. The character retains 7,762,852 source bytes per page and is copied per parse; native/GPU memory was not comprehensively measured. Character parsing, shader compilation and uploads still occur after selection. Chromium's separate loading acceptance covers CPU-throttled first paint and delayed assets, but there is no matched throttling or no-store speed matrix. Controller/interpolation/physics behavior remains unchanged; the experiment agent owns reconciliation and its latency/scaling investigation.
