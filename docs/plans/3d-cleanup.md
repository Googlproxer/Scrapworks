# Scrapworks 3D cleanup record

Updated 28 October 2026. The full 3D migration is complete through its documentation handoff. This cleanup follows the user's request to remove rejected design tools, obsolete 2D production material and other superseded project content. [Migration acceptance](3d-migration.md) remains the implementation checkpoint; later gameplay milestones remain pending.

## Removed from the working tree

| Category | Retired content |
| --- | --- |
| Rejected design tools | Articy importer/build helpers and generated catalogue; Game Balance Editor validator, guide and native snapshot. Fibery remains the active catalogue and tracker. |
| 2D production | Sprite sheets, Tiled terrain atlases/transitions, terrain verification script and obsolete sprite/tile production brief. |
| Superseded documentation | 2D history, early 3D walkthroughs/checklists, forwarding pages, 17 October baseline and old asset/cleanup/workflow reports. Current 23 October migration/refinement/workflow evidence remains. |
| Retired experiments | MPFB/smooth-character build/export/inspection scripts whose source experiments are already retired. |
| Unused imports | Unreferenced Grass001 source pack and duplicate static `assets/models/Protag-v1.glb`. Canonical model sources remain under `art/`. |
| Obsolete checks | Historical relocation comparator/manifest, removed-map audit requirement and Tiled editor ignore rule. |

The retirement set contains **151 files, 413,629,168 bytes (394.5 MiB)**, including ignored importer build products. Git records deletions only for tracked files; uncommitted trial files were backed up separately. No package removal was needed: Phaser and the other rejected tools have no current package dependency.

## Preserved active sources

Complete Game/MainMenu authoring directories and the Editor project remain intact. Canonical Blender/model/animation sources, modelling and approved finish references, environmental/machinery concepts, logo/cursor sources, exact relevant prompts and available licence/provenance records remain in [art/](../../art/README.md). The four live public assets, all runtime source, dependencies and authoritative diagrams are preserved.

[Fibery authoring](../design/balance/README.md), its entity/board IDs and [project tracking receipt](fibery-tracking.md) remain intact. The opening catalogue and agreed progression are the repository design reference; the retired database snapshot is no longer presented as a maintained second source.

## Recovery

Pre-cleanup commit **`dc8afc71d07ea6fd3af06f560ad8c46a184895fc`** contains the tracked retired files. Export selected paths to a ZIP and inspect in a separate directory:

```sh
git archive --format=zip --output=retired-project-sources.zip dc8afc71d07ea6fd3af06f560ad8c46a184895fc docs/history docs/plans/3d-cleanup-baseline.md docs/reports/assets docs/reports/cleanup/2026-10-17 docs/reports/workflow/2026-10-17 art/world/tilesets art/characters/protagonist-sprites-v1.png art/characters/protagonist-sprites-v2.png art/prompts.md art/relocation-2026-10-17.json tools/art tools/scenes/compare-audit.mjs assets/ambientcg/Grass001 assets/models/Protag-v1.glb
```

The rejected-tool trials were uncommitted. A **complete local recovery archive of all 151 removed files**, including those trials and their build products, was ZIP/CRC-checked and every member compared with its pre-removal SHA-256. Its directory is:

```text
C:\Users\googl\.codex\visualizations\2026\10\27\01a17b8e-cfe4-79d0-99a7-bfcf728f3c51\scrapworks-retired-tools-20261028T035426Z
```

`retired-files.zip` contains the full retirement set; `manifest.json` records every original path, size and hash plus the protected-source baseline. This is a persistent local recovery copy outside the repository; Git recovery covers the tracked files. External installed applications and external design projects were not changed.

Retired static scene/MPFB sources from the earlier cutover remain at commit `6cd9f6f`; see [scene recovery](../../assets/README.md#recovering-retired-scene-sources) and [MPFB provenance recovery](../../art/README.md#recovering-retired-mpfb-sources).

## Phase 4 Make Babylon the default and remove the 2D runtime

This retained anchor links the former cutover gate to its implemented result. Babylon is the sole renderer at `/`; `/3d` redirects to it. Angular owns title imagery, menus, Controls and loading/error/Retry. Production checks continue to reject retired renderer dependencies/assets. World markers compile to a plain definition; scene serialization is not a gameplay save.

## Validation

Verified after removal on 28 October 2026:

| Check | Result |
| --- | --- |
| Documentation | 37 documents, 402 local links and eight matching diagram sources; no failures. |
| Repository audit | 325 source/configuration files and 12 generated-ignore probes; no failures. Six existing design/tracking files remain untracked for review. |
| Export tests | All 13 pass, including dependency retention, staged publication/rollback and watcher behavior. |
| Production export/build | Both scenes export and the Angular production build passes; built scene/world/public assets match current exports. |
| Browser smoke check | `/` and `/3d` load Play Game, the world and animated character, pause/resume and Controls; no page errors or failed requests. Development UI remains excluded. |
| Source preservation | 197 protected files remain byte-identical. The logo provenance record changes only its usage description; all eight original generation runs remain unchanged. All 151 retirement candidates are absent and recoverable. |

The existing profiler now reserves a larger Resource Timing buffer before navigation and fails explicitly if it fills. Babylon's chunks exhausted Chromium's default 250-entry buffer, previously making the audit falsely report missing gameplay assets. The corrected probe observes all three required runtime loads on both routes. Browser timings are local software-renderer observations, not target-device qualification.

Pinned Yarn could not download through Corepack in this environment. Validation used installed tooling: `node tools/scenes/export.mjs`, then `node node_modules/@angular/cli/bin/ng.js build`, followed by `node tools/scenes/check-export.mjs --build`. The first build comparison detected newer export-manifest timestamps; rebuilding after export activity settled passed the strict comparison. Browser checks used the installed Playwright cache and loopback access outside the network sandbox. These results do not complete a clean dependency install, commit review or later gameplay milestone.
