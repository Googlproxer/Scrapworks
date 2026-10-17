# Editor export workflow validation

Recorded 17 October 2026. This cleanup implements the authoring/export tools while preserving user ownership of game/runtime implementation.

## Delivered

- `yarn dev` exports saved inputs, starts Angular, and watches Editor assets/project settings, enabled attached presentation scripts and the export policy. Saves are debounced; overlapping exports are serialized, and a save arriving during packing supersedes that attempt.
- Each pack uses an isolated workspace-local copy under `tmp/scene-export/`. The official CLI can write caches and generated data there without modifying authored inputs or the live browser output. This retains the CLI's full source-library processing cost and temporarily copies the source assets; it is not an incremental asset compiler.
- Only a validated export is published. Existing watched directories stay in place for Angular/Vite on Windows; changed dependency files are installed before scene entry points. Previous files are retained for rollback during publication, and obsolete generated files are removed on success. The unchanged script registry is not rewritten.
- Failed packing, invalid JSON, absent dependencies and superseded saves preserve the last working output and registry. Terminal errors remain visible and the next save retries. A process lock prevents independent export commands from overlapping. Windows shutdown stops the owned Angular/esbuild process tree.
- The CLI 5.5.2 no-physics workaround checks authored and packed data first. Editor `metadata.physicsAggregate` and legacy physics bodies cause a clear failure; gravity configuration alone remains supported. This adds no physics engine or game behavior.

## Checks

Twelve focused Node tooling tests pass: retained dependencies, new authored dependencies, unsafe paths, missing dependencies, isolated publication, complete failure preservation, publication rollback, concurrent export locking, physics guards, attached-script discovery, save batching/recovery and native watch exclusions.

The [browser probe](../../../../tools/scenes/check-dev-workflow.mjs) copies the project to a disposable directory and runs the actual Editor CLI, watcher, Angular/Vite and headless Chromium on loopback. It confirmed:

1. The initial export and `/3d` menu become ready.
2. A valid saved scene change reloads the browser and appears in the generated scene.
3. Invalid saved JSON produces a terminal error without reloading; every published scene/asset and generated-registry hash stays unchanged.
4. Correcting the scene recovers and reloads automatically.
5. Play Game works after recovery, with one canvas, no application alert and no browser errors.

The probe exposed a Windows issue with whole-directory replacement: Angular stopped noticing later asset changes. Publication now preserves watched directories, and the rerun passed. The [recorded browser result](browser.json) preserves the successful run. Server logs and a screenshot are generated under ignored `tmp/workflow-browser/`; the fixture is removed on exit. The probe changes only its copy of the source scenes and does not require the Editor GUI.

Production export/build passed and all 33 existing Chromium application tests passed. Current runtime URLs are retained; introducing a revision/content-hash manifest requires a later user-owned loader change. This tooling pass does not claim new gameplay, lifecycle/input recovery, world markers, marker compilation, fresh dependency bootstrap or renderer cutover. The [asset audit](../../assets/2026-10-17/README.md) remains the dated transfer/packaging baseline.

Final verification: all 353 snapshotted source/art/Editor/runtime/config files are byte-identical, including all 52 files under `src/`. Dependency sections, package-manager selection and lockfile are unchanged. All 543 production JavaScript files match the earlier asset-audit hashes. Export/build policy checks, 38 Markdown documents, 455 local links, eight diagram sources, formatting and Node syntax checks pass. Temporary export stages and browser-project copies were cleaned up. No source changes were staged or committed.

## Repeat

```sh
yarn test:export
yarn test:workflow
yarn scenes:export
yarn build
yarn assets:check --build
yarn docs:check
```

The browser probe needs the installed Playwright Chromium. Set `PLAYWRIGHT_BROWSERS_PATH` if its browser cache is outside the default location. It needs local loopback access; it creates no external service or account connection. Use the [tool guide](../../../../tools/scenes/README.md) for failure recovery and the [cleanup plan](../../../plans/3d-cleanup.md) for the remaining user-owned implementation.
