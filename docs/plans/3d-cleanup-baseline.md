# 3D cleanup baseline and progress

Recorded 17 October 2026. Scope: preserve the existing work and reconcile documentation for the selected 3D direction. The user owns actual game/runtime implementation; cleanup tools support preservation and validation.

The later [asset/export audit](../reports/assets/2026-10-17/README.md) reduced the fresh production output to 17.5 MiB, retained original sources, and reverified both routes. Initial packaging measurements below remain the earlier baseline.

## Preserved work

A verified checkpoint is stored outside the repository at:

```text
L:/Angular/_checkpoints/scrapworks/2026-10-17-before-3d-docs/
```

It preserves 442 tracked/non-ignored untracked files, totalling 632,834,017 bytes, from base commit `149ae49d390918671f2648dfe522c0b1e3355616`. It includes the complete on-disk Editor project/scenes/assets, local MCP plugin/configuration, export wrapper, loader, dependency/lockfile changes, and the cleanup plan. The checkpoint tool was added before capture and is included.

`worktree.zip` contains file contents; `manifest.json` records every source checksum and absent tracked path. `history.bundle` preserves Git history/HEAD; binary staged and working-tree patches plus the original status are saved separately. Creation verified every archived file checksum, supporting-file checksums, and the Git bundle. HEAD and the index were left unchanged. This is a recoverable file/history checkpoint, not a Git commit of the untracked work.

Ignored dependencies, generated outputs, caches, browser storage, workstation-only state, and unsaved Editor edits are outside its scope. The Editor's saved authored inputs are included. Use [the cleanup tool guide](../../tools/cleanup/README.md) and the checkpoint's `RESTORE.txt` to verify and restore into a new checkout.

## Implementation and validation baseline

| Item                      | 17 October state                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes                    | `/` still uses Phaser; `/3d` uses the Editor-authored Babylon MainMenu/Game scenes.                                                                                      |
| Runtime                   | Scoped Angular runtime, plain client contract, replayable lifecycle, resize, retry, first-frame readiness, transition guards and late-load disposal.                     |
| Authoring                 | One Editor project, manual export workflow and MCP setup. World-marker compiler and automatic export/reload are not implemented.                                         |
| Gameplay                  | Queue/logging simulation scaffold, earlier direct sprite movement, static Babylon rig. No authoritative world, salvage/crafting/research/machines/transport/restoration. |
| Saving                    | Dexie test records and experimental dialog. No world snapshot, gameplay reload, migration, or resilient autosave implementation.                                         |
| Production build and lint | Passed during the project review on 17 October before these documentation changes.                                                                                       |
| Application tests         | 33 tests across 10 files passed in Chromium during that review, including the existing shell accessibility checks.                                                       |
| Lint-tooling tests        | All 30 passed during that review. Older 4 October failures remain historical evidence.                                                                                   |
| Packaging                 | Existing output approximately 470.2 MiB; initial JavaScript 9.26 MB raw and estimated 1.61 MB transferred. Large grass-source textures are present in the output.        |

The review used `node tools/scenes/export.mjs` and installed Angular target tooling because Corepack could not download Yarn from its configured host. This is not a successful fresh-install/reproducibility check. Build-directory contents are not a measured scene-download baseline; clean-export and actual request measurements remain open.

Installed packages inspected during this cleanup are Angular 22.2.2, Babylon 9.30.0, Editor tools 5.5.2, Dexie 4.4.6, TypeScript 6.0.3, Vitest 5.0.3, and Playwright 1.64.0. The manifest pins Yarn 4.18.1 and Editor CLI/tools 5.5.2. Phaser observed in the browser was 4.2.1 and Node was 24.21.0. Recheck the lockfile and installed metadata when repeating version-sensitive checks.

## Documentation cleanup delivered

- Current README, documentation index, roadmap, TDD, GDD presentation statement, art brief, affected milestone plans, migration/setup guidance, and agent instructions distinguish the selected 3D direction from the still-running 2D route.
- The roadmap links detailed milestone checklists instead of repeating them. Plain simulation, local-first saves, empty-handed progression, research payment/history, and environmental trade-offs are retained.
- The [historical Tiled plan](../history/2d/tiled-world-integration.md), [4 October integration checklist](../history/2d/milestone-01-integration-2026-10-04.md), and [earlier art brief](../history/2d/art-direction-2026-10-04.md) preserve superseded instructions and dated evidence. The original Tiled plan path forwards to history.
- Historical [prompts](../../art/prompts.md), [tileset records](../../art/world/tilesets/README.md), and [completed Phase 1 walkthrough](../history/3d/phase-1-walkthrough-2026-10-11.md) are labelled. Exact prompt files, generation/verification JSON, source artwork, and maps are retained.
- Architecture diagrams use the Babylon presentation boundary, planned authored `WorldDefinition` compilation, and planned mutable `WorldState`. Generated diagram sources/images are checked together.
- [Cleanup tools](../../tools/cleanup/README.md) provide repeatable checkpoint verification, local documentation-link/anchor checks, and diagram-source consistency checks.

The cleanup leaves gameplay source, authored scene/asset data, runtime factories/routes, dependencies, and the lockfile unchanged. Package description/keywords and a documentation-check command are metadata/tooling changes only. Phaser remains installed and serves `/`.

## Cleanup validation

- The documentation checker passes across 34 Markdown documents, 382 local links/anchors, and eight matching standalone Mermaid sources. All eight diagram exports were regenerated; changed architecture images were visually inspected.
- SHA-256 comparison with the checkpoint confirms 51 gameplay-source files, 123 authored asset/project files, 160 art/provenance/map files, and the dependency lockfile are unchanged. Dependency sections and the package-manager selection are unchanged; the original historical prompt brief is retained verbatim beneath its status banner.
- The checkpoint verifier reads every archived source and checks its SHA-256 against the manifest. Python/Node cleanup-tool syntax, Markdown/tool formatting, and whitespace checks are included in this pass.
- The application build/test results above are the earlier 17 October review baseline. This documentation/tooling pass does not rerun or claim new gameplay validation.

## Art source layout delivered

The 159 source/resource files formerly under `docs/art/` now live in root [art/](../../art/README.md), preserving their character/world/machinery/branding/UI categories and linked MPFB library. `docs/art/README.md` remains visual guidance. Blender files/backups, model exports, images, exact prompts, licence comments and original validation reports retain their source bytes; only three Markdown resources and the logo/cursor runtime-reference fields are rebased. The [relocation record](../../art/relocation-2026-10-17.json) records each old/new path and checksum. Original dated inventories/reports keep their historical paths. Tool defaults and current links now use the root art directory; Editor imports, deployed inputs and game source are unchanged.

Validation for this move: 154 of 159 files are byte-identical; the other five contain only the documented Markdown/navigation updates. All 79 retained MPFB-library hashes and 796 snapshotted game/Editor/runtime/build files pass SHA-256 checks. Documentation links, eight diagram sources, export/build policy checks, four export-tool tests and syntax checks for 16 art Python tools pass. Inventory comparison accepts both the original and relocated layouts and rejects modified models, unrecorded metadata changes and missing sources. This move does not rerun the application's browser tests or claim new browser measurements.

## Development tooling delivered

`yarn dev` now exports and watches saved Editor assets, project settings, enabled attached presentation scripts and export policy changes. The official CLI packs an isolated workspace copy; validation, serialized publication and rollback protect the working export and generated registry. Invalid authoring produces a terminal error and retries on the next save. Physics bodies are rejected before the no-body flag workaround is applied. The [workflow validation](../reports/workflow/2026-10-17/README.md) records focused tests and a real Chromium/Angular save-failure-recovery probe. Runtime lifecycle/input, authored fixture/world markers and cutover remain user implementation work.

Validation: production export/build passed, all 33 existing Chromium application tests passed, and all 12 focused export/watcher tests passed. The isolated Chromium probe confirmed valid-save reload, failed-save preservation with no reload, corrected-save recovery and Play Game after recovery. Source/asset hashes and dependency metadata are checked separately; no game code is implemented by this batch.

## Documentation and repository handoff delivered

The [implementation checklist](3d-implementation-checklist.md) now gives the user a concrete order, existing files and acceptance checks for experimental save controls, lifecycle/input, the world fixture/definition, Babylon cutover, optional JavaScript reduction and the first gameplay/save slice. The obsolete Phase 1 scene-builder walkthrough is archived under 3D history, with a forwarding page at its former path. Current documentation-reference classifications and source-tracking results are recorded in the [cleanup handoff report](../reports/cleanup/2026-10-17/README.md).

`yarn cleanup:audit` verifies authored sources are not ignored and generated output stays ignored/untracked, and lists untracked inputs for human review without changing HEAD or the index. The strict `--require-tracked` mode remains an intentionally failing preflight until the user reviews/stages those inputs. Clean dependency bootstrap, live Editor identity and Git commit remain explicit preflight items; none is inferred from a file checkpoint.

A final file/history handoff checkpoint is saved outside the repository at `L:/Angular/_checkpoints/scrapworks/2026-10-17-cleanup-handoff/`. It captures the completed docs/tooling/art organisation and the user's existing application changes together. Verify it with `python tools/cleanup/checkpoint.py verify <directory>`; its own manifest records every file/hash and the unchanged base commit. The original pre-cleanup checkpoint remains available separately.

## Remaining work after handoff

| Cleanup area                | Status and next action                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preservation                | Original and final-handoff file/history checkpoints verified. Review/commit the existing untracked authored inputs separately; nothing was staged or committed by cleanup.                                                |
| Reproducibility and metrics | Fresh export/build comparisons, actual menu/Game request measurements, and per-file asset inventory are recorded in the asset audit. Fresh dependency bootstrap remains unverified.                                       |
| Documentation               | Current/history archive, reference audit and user implementation checklist delivered. Refresh statuses after the user's runtime work.                                                                                     |
| Assets                      | Deployment cleanup delivered through the export policy and Angular asset-copy exclusions. Original source packs/copies are unchanged; source/model derivatives and code-level registration slimming remain separate work. |
| Development workflow        | Saved-input watching, staged export/failure retention and physics guards are delivered; see the [workflow validation](../reports/workflow/2026-10-17/README.md).                                                          |
| Runtime fixture/lifecycle   | World grid/markers/compiler, input ownership, suspension and graphics recovery remain unimplemented.                                                                                                                      |
| Cutover                     | The user implements the default Babylon route, lazy-loading changes, compatibility redirect, and Phaser removal after the gate passes.                                                                                    |
| First gameplay              | Plain world/session, movement, manual salvage/crafting, and validated save/reload follow Milestones 2–4.                                                                                                                  |

Continue with the [3D cleanup plan](3d-cleanup.md). Updating guidance does not complete any unchecked gameplay requirement.

## 23 October 2026 migration implementation appendix

The preceding sections retain their 17 October scope and measurements. On 23 October the user authorized runtime implementation and removal of obsolete 2D runtime files, with an explicit stop after updating milestone progress at migration Phase 7.

The current implementation adds a validated plain WorldDefinition compiled from saved Editor marker transforms, a private plain WorldState, a 20 Hz application session, deterministic movement/collision and isolated developer-fixture placement. Normal worlds start with empty inventory, equipment, research and buildings. Manual salvage/crafting, factory systems and gameplay saves remain separate milestones.

The final historical 48-tile atlas moved unchanged to `art/world/tilesets/terrain-atlas-v2.png` and its Tiled reference was repaired. Unused public sprite/GLB duplicates, generated Tiled JSON and template assets were removed. Complete prior Game/MainMenu authoring is preserved in Git commit `6cd9f6f`; see the [retired scene source recovery instructions](../../assets/README.md#recovering-retired-scene-sources). The active character anchor has unit scale; the two-metre soil grid and bounded camera remain Editor-authored.

Fresh supporting checks passed on 23 October:

- Real scene export retained 11 generated files and filtered 33 unused library exports; scene/world publication is validated together.
- All 25 pure Node world/export tests passed, including invalid marker retention, hierarchy conversion, half-open bounds, frame-schedule equivalence, collision, pause and unavailable/repeated placement.
- Focused world/session TypeScript and ESLint passed. Asset/export consistency passed with two scene manifests and zero obsolete public exclusions.
- The [isolated Chromium development workflow](../reports/workflow/2026-10-23/README.md) passed valid-save reload, invalid-save retention without reload, corrected-save recovery and Play Game after recovery, with no browser errors. The process required localhost access because the execution sandbox rejects loopback connections with EACCES; its installed browser cache was selected explicitly.
- Documentation checks passed all 568 local links across 46 Markdown documents and eight synchronized diagram sources; current technical diagrams were regenerated and visually inspected. Repository audit found no ignored source or tracked generated-output violations. Untracked files remain for normal review; no commit was made.

These checks are supporting migration evidence, not the final end-to-end acceptance or milestone completion claim. The migration plan records final integration results and the documentation-only Phase 7 handoff.
