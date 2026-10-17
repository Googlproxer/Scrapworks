# Asset and export audit

Recorded 17 October 2026. The cleanup reduces deployed files while preserving authored sources, exact art/provenance records, and application code. Both the current Phaser `/` route and Babylon `/3d` route remain functional.

After this audit, the [art source-layout cleanup](../../../../art/README.md) moved source resources from `docs/art/` to root `art/`. The inventories and comparison JSON below retain their original paths/hashes as dated evidence. Resolve their old `docs/art/<resource>` paths using the [relocation record](../../../../art/relocation-2026-10-17.json); the build measurements are unchanged.

## Results

| On-disk contents                                    | Before                                   | After                                  | Reduction                             |
| --------------------------------------------------- | ---------------------------------------- | -------------------------------------- | ------------------------------------- |
| Production browser build                            | 493,087,467 bytes / 470.2 MiB; 611 files | 18,368,901 bytes / 17.5 MiB; 576 files | 96.3%                                 |
| Generated Editor scenes/assets                      | 456,528,509 bytes / 435.4 MiB; 54 files  | 6,580,408 bytes / 6.3 MiB; 24 files    | 98.6%                                 |
| Authored Editor asset data (122 non-document files) | 405,546,726 bytes                        | Unchanged                              | Original files retained               |
| Original `public/assets/` files                     | 26,811,850 bytes                         | Unchanged                              | Export exclusions; no source deletion |

Both measurements followed the project export wrapper and a successful production build. The compiled JavaScript remains byte-identical, including the 9.26 MB raw initial total and estimated 1.61 MB transfer size. Module-import and route-loading changes are outside this cleanup's code boundary.

| Browser interaction                  | Before encoded body bytes | After encoded body bytes |
| ------------------------------------ | ------------------------- | ------------------------ |
| `/3d` to menu ready                  | 3,041,701                 | 3,041,701                |
| `/3d` Play Game, additional requests | 3,862,671                 | 3,862,671                |
| `/` to menu ready                    | 4,205,523                 | 4,205,523                |
| `/` Play Game, additional requests   | 0                         | 0                        |

These are localhost production-build measurements with gzip for text, fresh Chromium contexts, no-store responses, and a 1440 by 900 viewport. The probe waits for enabled menu controls, disappearance of the loading status, and rendered Game frames. The ready-frame baseline restored the original full asset set alongside byte-identical production JavaScript; the after run used the fresh filtered build. Body sizes come from Resource Timing; they exclude HTTP headers and are not WAN load-time or FPS benchmarks. No browser errors or failed requests occurred on either route. The removed files were deployment baggage and were not requested by these interactions, so this pass does not claim a corresponding download or frame-rate improvement.

## Findings and consumer decisions

| Asset group                                     | Evidence and treatment                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assets/ambientcg/Grass001/`                    | No current scene references the material/textures. The CLI copied the pack and its quality variants anyway. Remove their generated copies after packing; keep the complete source pack in the Editor project.                                                                                                                                                                                                      |
| Grass normal maps                               | The approximately 96 MB NormalGL and NormalDX PNGs are 4096 by 4096 RGB with 16-bit channels. No resizing is needed for an unused library asset. Prepare measured runtime derivatives if these are later used in a scene.                                                                                                                                                                                          |
| Standalone `.material` files                    | Current scene material data is serialized into `.babylon`; exported grid/title material library copies are not runtime dependencies. Keep authored material sources and any future scene-declared external material dependencies.                                                                                                                                                                                  |
| `Protag-v1.glb`                                 | The files under `docs/art/characters/3d/`, `assets/models/`, and `public/assets/models/` have identical hashes and are 24,468,372 bytes each. Treat the art file as retained source and the Editor file as its import copy. The Game scene already contains the serialized rig/materials and binary geometry; exclude the unused standalone public GLB from deployment. The CLI does not separately pack that GLB. |
| Tiled map, terrain atlas, and star image        | No current code loads these files. Exclude their public copies from the Angular build, preserving all existing source locations, historical records, and links.                                                                                                                                                                                                                                                    |
| Phaser background, logo, and player             | Existing Boot/Preloader consumers still load these; retain them in the build while `/` remains Phaser.                                                                                                                                                                                                                                                                                                             |
| Cursor                                          | Preserve the source and build inputs used by `src/styles.scss`; leave its behavior unchanged.                                                                                                                                                                                                                                                                                                                      |
| Scene logo and binary geometry                  | Retain both scenes' CLI dependency lists, including the logo's available quality variants and all serialized geometry. Future authored dependencies enter those lists automatically.                                                                                                                                                                                                                               |
| GUI, addons, Recast, and material registrations | Editor tools import GUI/preload infrastructure and addons/navigation plugins; Recast imports are present in that path. Keep dependencies and broad runtime registration unchanged. Any code-level slimming needs the user's implementation and its own compatibility tests.                                                                                                                                        |

The generated filter excluded 30 files totalling 449,940,237 bytes. Angular's copy policy excludes the unused GLB/map/atlas/star files plus `.gitkeep`, totalling another 24,770,465 bytes. The asset README was updated as documentation; protected source data is byte-for-byte intact. No model, texture, map, material, or licence record was destructively optimised or moved.

## Preservation and provenance

The [pre-cleanup checkpoint](../../../plans/3d-cleanup-baseline.md#preserved-work) still holds the original on-disk work and Git history. Audit reports add per-file hashes and duplicate groups, preserving the relationship between source, Editor copy, and runtime output.

MPFB's source export and original deformation/reimport reports remain distinct from the separately authored `Protag-v1.glb`. Exact prompts, generation/verification JSON, source artwork, maps, Blender sources, and individual source-asset licence comments remain in their existing organised locations. The grass pack has no retained standalone licence/attribution file; its folder/material/source documents are preserved, and provenance should be reviewed before a future shipped use rather than inferred solely from its folder name.

## Export policy and verification

The [export policy](../../../../tools/scenes/export-policy.json) and [tool guide](../../../../tools/scenes/README.md) describe normal export, dynamic assets, and repeatable checks. The wrapper uses the installed CLI's `scenes-used-files.json`; it does not replace the Editor or modify its installation. It prunes generated `assets/` copies only after validating every declared dependency, keeps scene-level files, and rewrites `assets-list.json` to actual retained files rather than hypothetical compression variants.

Normal dev/build/test scripts already call the wrapper. A bare CLI or Editor export may repopulate unused generated copies; rerun the wrapper and checker before building. Additional assets loaded dynamically by future scripts must be declared in the policy. Angular's exact public exclusions are cross-checked against that policy.

Validation: production build passed, all 33 Chromium application tests passed, all four focused export-tool tests passed, and exported/build assets passed the policy/dependency checks. Both production routes were exercised before and after cleanup with identical request paths/body-byte totals and no browser failures. The comparison verifies all existing application JavaScript and protected source hashes.

## Evidence

- [Before inventory](before.json) and [after inventory](after.json): per-file size/hash and per-scene output references.
- [Before browser requests](browser-before.json) and [after browser requests](browser-after.json): menu/Game requests, body sizes, and browser outcomes.
- [Comparison](comparison.json): protected-source/JavaScript hash checks and size/request deltas.
- [Image metadata](image-metadata.json): retained grass source dimensions, depth, and channels.

Continue with the [cleanup plan](../../../plans/3d-cleanup.md). Character derivatives, dynamic presentation features, automatic export watching, code imports, and runtime cutover remain separate implementation work; no `src/` file was changed by this pass.
