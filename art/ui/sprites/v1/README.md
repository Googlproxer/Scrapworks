# Scrapworks UI sprites — first pass

Generated 11 November 2026 with the built-in image_gen tool, using the title logo and Field Kit concept as style references. The mixed-scrap illustration anchors the rest of the set. This pass awaits user review.

Open the [gallery](index.html) for each sprite at 128 px and comparisons at 32, 48 and 64 px on navy, cream and green. The [contact sheet](contact-sheet.png) shows the complete set.

## Files

| Location                                                       | Purpose                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [sources/](sources/)                                           | All 31 untouched generated PNG originals, with their original alpha and embedded metadata.             |
| [png/64/](png/64/), [png/128/](png/128/), [png/256/](png/256/) | Individual square transparent PNGs, named by stable content ID.                                        |
| [atlas.png](atlas.png)                                         | Transparent 2048 × 1024 atlas, eight columns of 256 px cells. The unused last cell stays transparent.  |
| [atlas.json](atlas.json)                                       | Per-ID frame coordinates, export paths, source bounds, dimensions and SHA-256 checksums.               |
| [generation.json](generation.json)                             | Exact prompts, reference paths and original generation locations for all 31 built-in generation calls. |
| [index.html](index.html)                                       | Standalone local gallery; works directly from a file URL.                                              |
| [contact-sheet.png](contact-sheet.png)                         | Labelled overview for review; labels and card backgrounds are separate from the transparent sprites.   |

## Coverage and bindings

All 28 current inventory items and placeables are covered. Their filenames use the IDs from [opening content](../../../../src/content/opening.ts), [factory blueprints](../../../../src/content/first-factory.ts) and [environment blueprints](../../../../src/content/environment.ts).

| Group                      | Sprite IDs                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Resources and materials    | `scrap`, `coal`, `plate`, `wire`                                                       |
| Components and consumables | `mechanical-part`, `electrical-part`, `research-kit`                                   |
| Tools                      | `prybar` — the currently implemented equipable tool                                    |
| Fabrication and research   | `basic-fabricator`, `medium-fabricator`, `recycler`, `extractor`, `laboratory`         |
| Power                      | `solar-panel`, `wind-turbine`, `power-connection`, `battery`, `coal-generator`         |
| Transport                  | `conveyor`, `sorter`                                                                   |
| Water systems              | `water-pump`, `pipe`, `pipe-junction`, `water-treatment`, `water-tank`, `water-return` |
| Restoration                | `greenhouse`, `air-scrubber`                                                           |

Three supplemental sprites bring the total to 31:

- `mini-fabricator` illustrates the built MiniFab and its `base-minifab` recipe. It is not a new inventory item ID.
- `water-clean` and `water-untreated` illustrate water-quality states. Water remains a fluid in the simulation.

These assets are UI illustrations for inventory, recipes, toolbar choices and inspection panels. They do not change the 3D world, machine models, content definitions or gameplay.

## Visual rules

Use chunky asymmetric silhouettes, angular cream panels, blue-steel structures, dark navy contours and restrained coral reinforcements. Broad painted light and shadow planes follow the top-left light direction. Copper distinguishes recovered wire; green foliage identifies the greenhouse; the water states use blue and muted green-blue.

Recognisable working parts distinguish machinery: the MiniFab carries a side crank, the basic fabricator is an open press, the medium fabricator is enclosed, the recycler has a large hopper, and the extractor exposes its auger. Details are simplified for small UI sizes. This first pass supplies one illustration per current item, rather than machinery-generation variants.

Keep names, quantities, selection marks, rarity/state indicators and focus outlines in the UI layer. Use the accessible item name on the owning control; a decorative image beside the same visible name can use empty alt text. Water-quality labels should remain visible alongside the indicators.

The PNGs include transparent padding and object shading. They contain no inventory cell, scenic ground plane, or separate cast ground shadow. Render them without stretching: use the supplied square canvas with a 1:1 aspect ratio. Prefer a 128 px source for 48–64 CSS pixels on a high-density display, or 256 px for larger inspection views. The 64 px export is suitable for small 1× displays.

## Rebuild derivatives

From the repository root:

```powershell
node tools/art/prepare-ui-sprites.ts
```

The [TypeScript preparation tool](../../../../tools/art/prepare-ui-sprites.ts) checks coverage directly against the static catalogue declarations. It reads the generated sources, finds visible bounds while ignoring the generator's nearly transparent alpha=1 padding noise, crops only the surrounding padding, proportionally resizes to at most 84% of each square, and centers the result. It retains the in-bound colors and alpha, and does not repaint the art or modify the originals.

The same command regenerates all PNG sizes, the atlas and metadata, the contact sheet, and the gallery. It verifies source alpha, clear visible margins and decoded export dimensions. All 31 sources and 93 size exports passed these checks; the complete contact sheet was visually reviewed. Detailed diagnostics remain local when needed. The [runtime UI integration](../../../../docs/art/ui-runtime.md) now uses the 128 px exports in the game. Its preparation command copies that runtime subset and leaves these sources unchanged. No CI playthrough was added.

To generate another visual pass, retain these originals and create a sibling version directory. The exact prompt set is in [generation.json](generation.json); generation itself is separate from the deterministic derivative command.
