# Scene export and asset audit tools

The official Editor CLI packs the authored project, including its asset library. The Scrapworks wrapper then uses the CLI's `scenes-used-files.json` to retain scene dependencies and declared dynamic assets in generated `public/scene/assets/`. Scene geometry, manifests and other generated scene-level files remain intact. Active source files under `assets/`, `art/` and `public/assets/` are preserved. [Root art resources](../../art/README.md) are separate from the visual design document in `docs/art/README.md`.

## Normal export

```sh
node tools/scenes/export.mjs
node tools/scenes/check-export.mjs
```

`yarn dev` runs the [development coordinator](dev.mjs); `yarn build` and `yarn test` run the export wrapper once before Angular. Use these commands rather than the raw Editor CLI for deployment. A raw CLI pack or Editor export can repopulate unused generated library copies; the check detects that, and the wrapper reapplies the policy.

The wrapper copies authored inputs into an isolated project under ignored `tmp/scene-export/` and runs the official CLI there. It checks scene dependencies and the physics workaround, filters unused generated library copies, then publishes changed files and the generated registry. Publication preserves Angular's watched directories, installs dependencies before scene entry points, removes obsolete generated files and restores previous files on failure. An unchanged registry is not rewritten. Original Editor/library inputs remain intact. The upstream CLI still processes the entire library; staging adds temporary disk/copy cost and does not provide incremental packing.

The no-body fixture workaround is limited to scenes without physics bodies. Authored and packed data are checked for Editor `metadata.physicsAggregate` and legacy body/impostor data before disabling the CLI 5.5.2 unconditional flag. Adding physics requires the user's deliberate runtime setup; the exporter reports an error instead of silently disabling authored bodies.

## Development watching and recovery

```sh
yarn dev
yarn dev --port 4300
```

The coordinator exports before starting Angular, then watches `assets/`, the `.bjseditor` file, enabled attached presentation-script paths under `src/`, and `export-policy.json`. It excludes generated `public/scene/`, `src/scripts.ts`, export caches, temporary files, source `art/` projects and documentation. Import art into the Editor's asset library and save before expecting a browser update. Angular continues to handle ordinary application edits through its own watcher.

On Linux, the coordinator defaults Angular to `--poll=500`. Parcel's native Linux watcher reports an atomically replaced asset as newly created, which Angular can rebuild without sending a browser reload. Polling detects the replacement while preserving atomic scene publication and rollback. An explicit `--poll` argument overrides the interval; the authoring watcher itself continues using native filesystem events on every platform.

Restart `yarn dev` after changing export/compiler tooling. A running Node process retains its imported modules; a coordinator started before a tooling change can otherwise republish an older output format on the next authored save. Stop the previous coordinator before starting a replacement.

Saves within 200 milliseconds are coalesced. Exports never overlap. A further save during packing supersedes the staged attempt and schedules the latest inputs; only validated output reaches the served tree. Angular/Vite sends the reload after publication. An invalid save prints `Export failed; last working scenes retained` in the terminal, preserves existing output and retries when the next relevant save arrives. Fix an initial export error and restart `yarn dev`; Angular does not start against missing or invalid initial output.

A lock at `tmp/scene-export.lock` serializes separate development/build/test export commands. If another export is active, wait for it to finish. A hard crash can leave the lock or a staging directory behind: inspect the lock's recorded PID and verify that it has stopped before removing that specific lock file. Normal completion and Ctrl+C clean up the stage/lock and stop owned child processes. If publication rollback itself fails, the error reports a preserved staging directory containing the previous files; inspect that recovery copy before deleting it. These are tooling recovery paths, with no gameplay state changes.

## Runtime policy

[export-policy.json](export-policy.json) records additional dynamic scene assets, public-file exclusions, live-route consumers, and provenance notes. Automatically collected scene textures, their quality variants, and geometry are retained as the user edits scenes. No hard-coded list of today's texture names determines scene retention.

For an asset loaded dynamically by a presentation script and absent from the scene manifest, add its exact export-relative path and supporting files to `additionalSceneAssets` before exporting. Paths use forward slashes, without `./`, traversal, query strings, or URLs. The file must exist in the packed output. Re-export and check the real browser interaction whenever adding a dynamic consumer.

Angular's `public` asset-copy rule matches `excludedPublicAssets` exactly; the current list is empty because obsolete public copies were removed. Live assets are the Angular background/logo, cursor and animated protagonist derivative. Character source projects remain outside deployment. See [retired-source recovery](../../docs/plans/3d-cleanup.md#recovery). Keep policy consumers and Angular configuration aligned when changing runtime assets.

The exporter compiles saved Game marker metadata into `public/scene/worlds/game.json` before packing, then publishes it with the same scene generation. See [world-marker authoring](../world/README.md). Invalid markers retain all last-working output. The export audit explicitly requires this world file, validates its schema, compares it with saved markers and checks its assets-list registration.

## Repeat the audit

```sh
node tools/scenes/inventory.mjs --output tmp/asset-audit/latest.json
node tools/scenes/check-export.mjs --build
node --test tools/scenes/*.test.mjs
node tools/scenes/check-dev-workflow.mjs
node tools/scenes/profile-browser.mjs --output tmp/asset-audit/browser.json
```

Inventory reports list sizes, SHA-256 hashes, duplicate sources, and exported per-scene dependencies. `check-export --build` requires a fresh production build and checks the copied assets, retained-route inputs, and excluded files. The focused Node tests cover retention plus staging/rollback, locking, physics checks, attached scripts, save batching/recovery and native watch exclusions. The separate browser probe copies the project and checks actual Angular/Vite reload, failed-save preservation, corrected-save recovery and Play Game; it writes logs/results/screenshots under `tmp/workflow-browser/` and removes its fixture. See the [23 October workflow validation](../../docs/reports/workflow/2026-10-23/README.md).

The browser probe uses the project's installed Playwright Chromium and a loopback-only static server. It serves a production build with gzip for text, creates fresh desktop contexts for both routes, records Resource Timing body bytes, exercises Play Game, and saves screenshots under `tmp/asset-audit/` by default. It enlarges the timing buffer before navigation so module chunks cannot hide later scene/model requests, and fails if that buffer is exhausted. If the browser cache is redirected, point `PLAYWRIGHT_BROWSERS_PATH` at the installed Playwright cache. It does not install browsers, change game code, or measure real-network latency/FPS.

Use a new report directory for each audit. Keep dated migration measurements separate from fresh inventories and verify active source hashes before and after asset cleanup.

See the [migration validation](../../docs/reports/migration/2026-10-23/README.md) for dated production measurements and the [cleanup record](../../docs/plans/3d-cleanup.md) for retired tools/assets. Gameplay progression and persistent world saves remain outside the migration checkpoint.
