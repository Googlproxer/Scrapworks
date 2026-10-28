# 3D migration validation — 23 October 2026

The Babylon migration is implemented through Phase 6. Phase 7 updates documentation only. No salvage, crafting, inventory gameplay, research, machines, transport, restoration or gameplay-saving system was added.

This is the original three-clip migration checkpoint. The later user-requested [Controls and turning refinements](refinements.md) record the five-clip asset and updated UI/navigation. The turn clips remain in that asset but runtime playback was subsequently disabled at the user's request. Bytes, hashes and timings below remain evidence of this earlier checkpoint.

## Delivered behavior

The canonical `/` route loads Babylon; `/3d` redirects to it. Angular owns the title, menus, Controls and readable loading/error/Retry states. Controls use a separate Dexie database and support alternate bindings, controller selection, stick deadzones and remapping. Production templates are separate HTML files.

An Editor-authored 10 × 10 world with 2-metre cells compiles to validated plain data. The application owns 20 Hz simulation with at most five catch-up steps, camera-relative movement, collision and empty starting possessions. Terrain/entity picking and development-only placement use plain grid rules. The current protagonist has in-place Idle/Walk/Run animation and is loaded once at an authored anchor.

At this checkpoint, source art, original Blender files, earlier character experiments, historical 2D sources and dated evidence were preserved. Superseded sources/tools/reports were subsequently retired by the [28 October cleanup](../../../plans/3d-cleanup.md); the numerical evidence below remains dated 23 October. Retired static character/title scene sources remain recoverable from Git commit `6cd9f6f` using the [scene source recovery instructions](../../../../assets/README.md#recovering-retired-scene-sources).

Preservation update, 24 October 2026: the duplicate local scene archive was removed after confirming that its scene and script sources match Git history; its four additional world-marker files duplicate the active Game sources. The measurements below retain their original 23 October scope.

## Fresh validation

| Check | Result |
| --- | --- |
| Full Angular/Vitest Chromium application suite | 181 tests passed, 19 files; final run at 20:02 Sydney, 30.96 seconds |
| World compiler and staged export tests | 27 passed, including missing/stale/invalid world publication checks |
| Custom ESLint tool tests | 30 passed |
| Application ESLint | Passed with zero warnings |
| Application and spec TypeScript checks | Passed |
| Editor scene export and production build | Passed |
| Strengthened asset/export audit against production | Passed; compiled `migration-world-v1` matches current markers |
| Actual authoring save/export/reload workflow | Passed; invalid save retains all published hashes and recovery reloads |
| Development browser flow at DPR 1 and 2 | Passed; no page errors and no axe violations |
| Production browser `/` and `/3d` | Passed; no failed requests/page errors, one canvas, both resolve to `/` |
| Production UI audit | No diagnostics, fixture instructions or test-save UI in title/game/pause/Controls |
| Runtime/asset cutover audit | No Phaser markers in 740 emitted JavaScript files; no retired runtime assets; sole runtime GLB is protagonist v2 |
| Documentation and repository checks | 48 documents, 588 local links and 8 diagram sources pass; repository audit verifies 571 source files and 12 generated-ignore rules |

See [browser results](browser/results.json), [production/performance report](performance.json), [build-input audit](build-input-audit.json), [authoring workflow results](../../workflow/2026-10-23/README.md), and the [character validation](../../../../art/characters/3d/protagonist-runtime-v2/validation-report.json). The build-input audit checked all 3,777 inputs in Angular's emitted `browser-stats.json` and found no Phaser dependencies; it supplements the profiler's optional lookup for the older `stats.json` filename.

The application suite covers controller mappings and disconnection, quick taps/simultaneous actions, binding validation, held suppression, stale frames/callbacks, native UI input, focus restoration, real IndexedDB settings reload/failure/isolation, lifecycle failures/late completions, independent hosts, pause/zero size/visibility, graphics loss and disposal. Plain tests cover transforms, units, bounds, deterministic stepping, movement rates, collision and rejection without placement mutation. Renderer tests load the actual exported model and verify heading, blending, picking at multiple camera/display configurations and obstruction fade/restore.

The external browser flow uses actual keyboard/mouse events: Play, walk/sprint, right drag/wheel, Escape menu, held W across resume, Ctrl/Tab/Alt capture, saved-settings reload, developer placement and occupied rejection, resize and axe. Source-state inspection is confined to the development probe; production checks use the served build without those hooks.

During validation, actual browser interaction exposed and resolved right-drag mapping, camera follow changing orbit, and Babylon resetting canvas tabindex. Review/tests also corrected stale session callbacks, raw capture release/click handling, selector reopen state and missing-world export audit coverage. The final full suite is green. Production UI exclusion is verified against the actual optimized build; Angular's application test target uses development settings.

## Character and visual evidence

The current-character derivative is **4,102,120 bytes (3.91 MiB), 37,655 triangles, 10 materials and 52 joints**, with 13 embedded WebP images at 512–2048 pixels. It meets the requested runtime budgets. Its SHA-256 is `6707f196afc943e97af9fcb726bd18efe884f5b0a2af731fd787f4a8cf308396`.

Original source and animation-archive hashes, retargeting details and provenance limits are in the [asset README](../../../../art/characters/3d/protagonist-runtime-v2/README.md). The original source files remain unchanged. No acquisition URL/license was invented for the existing animation archive.

- [Production title](production-screenshots/babylon-canonical-menu.png) and [production Game](production-screenshots/babylon-canonical-game.png).
- [Runtime sprint](browser/run-dpr1.png), [perspective placement fixture](browser/perspective-dpr1.png), [orthographic comparison](browser/orthographic-comparison-dpr1.png), and [640 × 480 resize](browser/resize-dpr1.png).
- Equivalent DPR 2 screenshots are alongside these files. The [asset contact sheet](../../../../art/characters/3d/protagonist-runtime-v2/animation-contact-sheet.png) covers front/back/side idle and sampled walk/run phases.

Perspective preserves a larger, more readable character in the default elevated composition; orthographic makes cell proportions more uniform but reduces character prominence at the comparison extent. Perspective remains the authored default. The fixture's capsule deposit and box blocker are intentional test geometry, not finished salvage/machine artwork.

## Migration-scene measurements

Production deployment: **13,594,432 bytes in 759 files**. Fresh local navigation transfers 2,551,141 encoded body bytes to reach the menu; Game adds 4,124,187 bytes. These are local Resource Timing body sizes, not WAN latency measurements.

Chromium 156.0.8078.4 on Windows, 1440 × 900 at DPR 1, reported **ANGLE Vulkan SwiftShader**. Each route used a fresh context, one-second warmup, two-second stationary sample and two seconds with W held.

| Route | Stationary mean / p95 | Movement mean / p95 |
| --- | --- | --- |
| `/` | 34.77 / 50.00 ms | 33.06 / 33.40 ms |
| `/3d` → `/` | 34.46 / 50.00 ms | 32.80 / 33.40 ms |

These are browser RAF intervals on a software renderer, not GPU execution timings or proof of a 60 FPS physical-device target. The scene contains one animated character, one deposit, one blocker and a flat grid. A growing factory, machinery/transport stress, save workload, physical GPU/VRAM and full system memory benchmarks remain pending.

## Reproduction and limits

Use the repository's normal scripts after dependencies are installed: `yarn scenes:export`, `yarn test`, `yarn lint`, `yarn test:lint`, `yarn test:world`, `yarn test:export`, `yarn test:workflow`, `yarn build`, `yarn assets:check --build`, `yarn docs:check` and `yarn cleanup:audit`.

This environment used the installed CLI directly because the pinned Yarn launcher could not be downloaded through the restricted network. Chromium browser commands needed localhost access outside the restricted sandbox. No rejected check was marked passed. This is not a fresh dependency-install validation.

The browser probe is [check-migration-browser.mjs](../../../../tools/scenes/check-migration-browser.mjs): pass the running development origin and an output directory. The production capture is [profile-browser.mjs](../../../../tools/scenes/profile-browser.mjs): build first, then pass `--output` and `--screenshots` paths. Python Playwright was unavailable, so these use the repository's installed Node Playwright. The old running development watcher was restarted on its existing port 4200 after its cached pre-compiler export code was identified; the extra validation server was stopped.

**Not executed/qualified:** physical Xbox/DualShock/DualSense devices, other browser engines, a physical-GPU 60 FPS target, clean dependency installation, full growing-factory benchmarking, and a Git commit. Touch support is out of scope. Gameplay-saving tests and future gameplay acceptance are pending because those systems are not part of this implementation.

The existing test-save database is unchanged. Separate Controls settings persistence does not establish gameplay saving. The milestone documents credit only demonstrated integration, simulation, movement, animation and presentation progress, and this migration stops after that reconciliation.
