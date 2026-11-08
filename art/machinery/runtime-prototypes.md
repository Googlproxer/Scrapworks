# Milestone 6 procedural machine prototypes

Authored 8 November 2026 as original Babylon primitive geometry in [machine-geometry.ts](../../src/game/views/machine-geometry.ts). That TypeScript file is the editable source; [EntityView](../../src/game/views/entity-view.ts) owns flat materials, world binding and disposal. No external mesh, texture, generated image or third-party artwork is used by these prototypes. The repository licence applies.

Seven distinct silhouettes represent solar panels, wind turbines, recyclers, Basic/Medium Fabricators, scrap extractors and labs. Asymmetric input/output shapes show orientation, with a separate power terminal. Connection lines render the authoritative saved topology. Geometry and animation own no stock, power, production or research state.

The placeable toolbar's B build preview reuses these silhouettes at the selected one-cell footprint and quarter turn. Preview meshes cannot be picked and own no simulation state; the worker validates and consumes the active bag item at placement.

Dimensions are authored in centimetres at the presentation boundary. The simulation retains one-cell footprints, metre positions, quarter turns and independent collision. These are functional prototype models for the [approved flat finish](../../docs/art/README.md); retained recycler-generation concepts remain references for later art refinement. The [Milestone 6 report](../../docs/reports/milestone-06/2026-11-08/README.md) contains browser evidence.
