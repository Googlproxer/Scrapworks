# Cleanup handoff and reference audit

Recorded 17 October 2026. This pass closes the documentation/repository checks that can be done while leaving application, runtime and gameplay implementation to the user. Follow the [implementation checklist](../../../plans/3d-implementation-checklist.md) in order.

## Documentation and source organisation

The superseded code-built Babylon walkthrough now lives under [3D history](../../../history/3d/phase-1-walkthrough-2026-10-11.md). Its former plan path forwards to the archive and current setup/checklist. Code examples and dated evidence are retained with rebased links. The earlier 2D implementation/art records remain under `docs/history/2d/`; exact source artwork/prompts/provenance stay in root `art/`.

Current plans and status tables distinguish delivered cleanup tools from pending runtime work. The [repo audit tool](../../../../tools/cleanup/audit-repository.mjs) checks source tracking and generated-file ignore rules without changing HEAD or the index. The [recorded repository inventory](repository.json) lists individual untracked inputs for review. These checks do not stage or commit the user's earlier work.

## Retained-reference classifications

| Reference group                                                                | Why it remains                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phaser in README, TDD, agent guidance and migration/cleanup plans              | `/` still uses Phaser. Transition import/lint rules and removal instructions apply until the user completes cutover.                                                          |
| Phaser/Tiled, sprites and pixel projection in historical records               | Dated decisions, implementation instructions and validation are preserved as history, with active guidance linked.                                                            |
| Sprite/tile dimensions in `art/prompts.md` and tileset records                 | Historical generation/authoring records accompany the original assets; the active visual brief uses 3D.                                                                       |
| UI imagery, flat textures and orthographic projection                          | Valid resources and camera choices within a 3D game. They do not require a second world renderer.                                                                             |
| Old `docs/art/<resource>` paths in dated JSON inventories/build reports        | Original evidence retains its recorded paths and hashes. The root art relocation record supplies current paths; `docs/art/README.md` remains visual guidance.                 |
| Old 24-test, large-build and manual-export statements                          | Kept within explicitly dated earlier evidence; newer asset/workflow reports and progress sections record the later results.                                                   |
| Missing prototype-scene builders and earlier smooth-character study            | Code-built builders are historical examples; active guidance points to Editor scenes. The absent art study is labelled unavailable, without creating empty substitute assets. |
| Planned `WorldState`, `WorldDefinition`, marker compiler and gameplay diagrams | These are declared future contracts/systems; their presence in design documents does not mark them implemented.                                                               |

The current Markdown/link/anchor and eight-diagram-source checks are repeatable with `yarn docs:check`; `node tools/cleanup/check-docs.mjs --audit-2d` prints retained matches for review. Current reference classification must be revisited after the user's cutover removes live Phaser consumers.

## Verification and remaining limits

The [asset/export audit](../../assets/2026-10-17/README.md) records source hashes, deployment reductions and menu/Game request measurements. The [workflow validation](../../workflow/2026-10-17/README.md) records the later production build, 33 existing application tests, 12 export/watcher tests and actual Chromium save/reload/failure recovery. This documentation/repository pass does not rerun or claim new runtime acceptance.

This pass also completed an installed-dependency production build and export/build consistency check. SHA-256 checks confirm all 353 snapshotted source/art/Editor/runtime/config files remain unchanged, including all 52 files under `src/`; dependency sections and the package-manager selection are unchanged. All seven historical walkthrough code blocks match the original tracked examples. Documentation checks pass across 41 Markdown files, 517 local links and eight diagram sources. The repository audit verifies 12 generated-output ignore rules and reports 331 untracked source/tool/documentation files; strict tracking mode correctly fails until those inputs are reviewed and tracked. Node syntax, formatting and whitespace checks are included.

- Generated output/cache ignore rules are verified; authored inputs are not accidentally ignored. Many sources and the art relocation remain untracked, so review/staging/commit is still pending. Use the inventory's path lists rather than adding generated directories.
- Offline `corepack yarn --version` cannot load the pinned 4.18.1 release: its package-host download is unavailable with network disabled. Installed-dependency export/build results do not establish a clean install. Repeat `yarn install --immutable` from a clean checkout when the pinned release can be obtained.
- The Editor was not running during this pass. Its existing MCP tooling remains available; repeat the harmless live identity check when the project is open.
- The retained unused grass pack has no local standalone licence/provenance record establishing its original download. Keep that gap visible before shipping a derivative; the current export policy excludes it from deployed scene assets.
- Runtime save controls still present an experimental test-data dialog. The checklist assigns hiding/labelling it and preserving its database to the user.

## Preservation

The original verified checkpoint remains at `L:/Angular/_checkpoints/scrapworks/2026-10-17-before-3d-docs/`. A final handoff checkpoint is recorded in the [cleanup progress record](../../../plans/3d-cleanup-baseline.md) after the documentation and tooling checks complete. Each checkpoint preserves file contents, original Git state and history without staging the working tree. Use the [checkpoint guide](../../../../tools/cleanup/README.md#preserve-a-worktree) to verify or restore into a separate directory.
