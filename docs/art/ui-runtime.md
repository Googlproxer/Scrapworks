# Runtime UI kit integration

Implemented 13 November 2026 from the accepted [UI kit](ui-kit.md), [Field Kit reference](../../art/ui/kit/v1/responsive.html) and [UI sprites](../../art/ui/sprites/v1/README.md).

## Shared presentation

[src/styles/_ui-kit.scss](../../src/styles/_ui-kit.scss) owns the cream/navy/steel/coral palette, local display/body font stacks, angled buttons, selected-tab coral caps, native input/dropdown surfaces, continuous progress tracks, inset wells, reinforced dialog shells and rotated title plates. [src/styles.scss](../../src/styles.scss) loads it once. Its controls and surfaces are scoped to the application root and CDK overlay container; `.sw-ui` explicitly enables the same theme for test fixtures or standalone previews. Component styles own their layout and state-specific presentation.

Dialog bodies scroll inside fixed frames without stretching artwork. Separate SVG edge tiles and corner pieces preserve their original silhouettes and inner corner joins. The navy fill is inset behind them; transparent exterior cuts expose the game/backdrop. Controls and Graphics retain fixed headers/actions while their content scrolls. Compact Controls uses stacked binding rows.

The Field Kit uses three work columns when its content width is at least 768 px, then two columns before switching to a focused work area below 640 px. Inventory, Crafting and MiniFab share the existing component state; choosing a compact area does not cancel crafting or reset selections. Main section changes and closing still use the existing unfinished-work confirmation. Limits remain configurable in [variables.scss](../../src/variables.scss).

The runtime crank uses a 192 px nominal desktop canvas, 152 px in intermediate layouts and 200 px in compact layouts, with proportional artwork. Native controls retain a minimum 44 px target; the taller standalone proof remains a visual construction reference.

## Screen coverage

| UI area                                                | Integration                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main menu and HUD actions                              | Cream/coral action faces, consistent focus treatment, responsive action grouping and existing logo/backdrop.                                                                                                                                                                  |
| Boot fallback, loading and retry                       | Shared inset loading plates, chamfered progress track, green fill and existing reduced-motion behavior.                                                                                                                                                                       |
| Field Kit, manual and objective guide                  | Patterned shell, rotated title/coral wing, selected-tab caps, inset guidance and compact work-area controls.                                                                                                                                                                  |
| Inventory and equipment                                | Sprite slots with quantities and accessible item names; equipment/toolbar assignment and material recovery remain available through disclosure controls.                                                                                                                      |
| Handcrafting and MiniFab                               | Actual recipe output/ingredient sprites, batch quantities, reserved status/ingredient regions, paired batch/actions and retained request/buffer/cancellation controls.                                                                                                        |
| Winding                                                | Registered housing/arm/grip layers. The arm rotates about the actual pivot; a stationary wrapper casts its screen-space shadow. Pointer, rebindable keyboard and selected-stick input use the existing winding travel and worker commands. Resize releases an active gesture. |
| Research                                               | Kit faces for tree nodes and queue actions, existing status/selection distinctions, resource sprites in requirements and retained tree navigation.                                                                                                                            |
| Factory, transport, environment and machine inspection | Shared controls, progress, native dropdowns, resource-buffer slots and equipment/fluid illustrations. Existing transfer reservations and machine-status geometry remain.                                                                                                      |
| Pause, save/load and confirmations                     | Patterned pause shell, sticky resume/navigation actions, inset save sections, treated run-name inputs and matching confirmation titles/actions.                                                                                                                               |
| Graphics and Controls                                  | Patterned shells, title plates, selected tabs and kit controls throughout the existing setting/binding flows.                                                                                                                                                                 |
| Notifications and debug drawings                       | Angled inset plates and common actions; notice semantics, tones, dismissal and lifetimes remain intact.                                                                                                                                                                       |
| Asset credits                                          | Shared palette/type and title artwork on the standalone page; readable document scrolling retained.                                                                                                                                                                           |

## Runtime artwork and preparation

Run from the repository root:

```powershell
node tools/art/prepare-ui-kit.ts
```

The [preparer](../../tools/art/prepare-ui-kit.ts) copies 26 SVG pieces into [public/assets/ui/kit/v1/](../../public/assets/ui/kit/v1/) and 31 transparent 128 px PNGs into [public/assets/ui/items/](../../public/assets/ui/items/). The total is 671,840 bytes. [runtime.json](../../art/ui/kit/v1/runtime.json) records every source, target, size and SHA-256 checksum. Unchanged copies are retained. The normal build/development entry points run this preparation automatically.

Large generated originals, concept screens, atlas and other reference exports stay under `art/`. The game loads individual sprite derivatives through [ItemSprite](../../src/app/shared/item-sprite/item-sprite.ts), using `NgOptimizedImage` with fixed intrinsic dimensions and proportional CSS sizing. [RecipePreview](../../src/app/features/game/recipe-preview/recipe-preview.ts) reads the real recipe data and does not issue gameplay commands or modify content definitions.

## Validation

The [runtime screenshot index](../../art/ui/kit/v1/previews/runtime/README.md) contains 20 direct captures of the integrated UI. Start with the [desktop Field Kit](../../art/ui/kit/v1/previews/runtime/field-kit.png), [compact MiniFab](../../art/ui/kit/v1/previews/runtime/field-kit-compact-minifab.png), [Controls](../../art/ui/kit/v1/previews/runtime/controls.png), [pause/save dialog](../../art/ui/kit/v1/previews/runtime/pause-saves.png) and [machine inspection](../../art/ui/kit/v1/previews/runtime/machine-inspection.png).

The [validation record](../../art/ui/kit/v1/previews/runtime/validation.json) records 217 passing focused UI tests in 28 files, successful development/production builds, ESLint and strict tooling TypeScript checks. All 19 reviewed development states and 19 production states passed AXE with zero violations and no runtime errors. Production checks also verified loaded images and horizontal overflow, with Field Kit frames contained at 1440×900, 900×760, 390×844, 320×568 and 1280×480. Small and short windows scroll inside their frames.

The loading reference was captured with JavaScript disabled. Its AXE audit uses the bootstrap with application scripts withheld, allowing the audit's own timers to run. Third-party Babylon Inspector controls retain their SDK theme; the application-owned inspector controls and status messages use the kit.

Detailed diagnostics remain in the ignored [local UI review](../reports/ui-kit-2026-11-13/). They use temporary browser profiles and an existing earned checkpoint, are manually invoked, and are not CI gameplay routes.

The integration does not change simulation rules, scene ownership, world assets or save formats. Production dialogs retain their focus handling, input ownership, confirmation behavior and existing actions.
