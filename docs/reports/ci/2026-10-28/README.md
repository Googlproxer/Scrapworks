# Clean setup and full CI — 28 October 2026

**Result: passed.** [GitHub Actions run 40632360002](https://github.com/Googlproxer/Scrapworks/actions/runs/40632360002) validates committed revision `e93210d2a4f6641435439209e8290f5788bfc34a` on a fresh Ubuntu runner. Every job step succeeded; no required checks were skipped.

| Stage | Result |
| --- | --- |
| Clean setup | Node 24, Corepack/pinned Yarn 4.18.1, `yarn install --immutable` and Chromium/Linux dependencies pass. |
| Scene export | Saved Editor sources regenerate browser scenes, world definition and script registry. No existing node_modules or generated exports are copied from the developer checkout. |
| Lint | Application/templates and all 30 lint-tooling tests pass. |
| Documentation | 37 documents, 402 local links and eight diagram sources pass in this tested revision. |
| Export tooling | All 13 tests pass. |
| World/simulation | All 26 tests pass. |
| Chromium | All 284 application/renderer/accessibility tests pass across 22 files. |
| Production | Build and strict exported/built-asset verification pass; production artifact uploaded. |
| Authoring workflow | Isolated development reload, invalid-save retention and corrected-save recovery pass. |

## Correction exposed by the clean run

The earlier [run for `50cdc89`](https://github.com/Googlproxer/Scrapworks/actions/runs/40631642982) installed locked dependencies and exported scenes successfully, then failed documentation checks. The committed art reorganisation flattened `art/characters/3d/` into `art/characters/` and retired the south-idle illustrations. Some documentation, art tools and the export policy still used the former paths. Commit `e93210d` updates those references, preserves historical source/report paths where they describe original evidence, and records the retired illustration provenance. Runtime source and asset contents are unchanged by the correction.

## Milestone decision

The user confirmed the dependency/authoring changes had already been reviewed and committed. The complete CI result supplies the remaining clean-setup evidence for [Milestone 1](../../../plans/milestone-01-project-and-integration.md) and its [Fibery follow-up task](https://scrapworks.fibery.io/Project_Tracking/Task/9). Later gameplay milestones and target-device/factory-scale performance qualification remain separate.

The earlier offline/local-tooling results in migration and cleanup reports retain their original dates and limits. This run establishes a clean pinned-package-manager installation and the full configured Linux CI workflow.
