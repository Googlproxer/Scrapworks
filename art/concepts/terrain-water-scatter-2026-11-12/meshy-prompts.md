# Meshy prompts for terrain scatter and shoreline studies

12 November 2026. Fifteen independent prompts accompany the [six concept boards](README.md). Generate one asset at a time; a whole catalogue sheet is a review reference, not a single model input. For image-to-3D, use one clean view of the chosen object rather than the complete sheet.

Start with **R1, R2, R3, P1, P2, P5 and P6**. Test these at the game's normal overhead camera before generating the expansion variants. R5 and R6 use the four-stone arrangements shown in the delivered sheet; component counts are design choices, not a generation guarantee.

## Generation and cleanup

These prompts describe shape and material. The dimensions and **final triangulated Blender budgets** below are proposed project acceptance targets, not Meshy output guarantees or measured performance limits. Several targets are deliberately below 100 triangles. Set the lowest suitable available geometry target, then simplify or rebuild in Blender to meet them. Compare the silhouette with the concept after reduction.

Meshy's [prompting guide](https://docs.meshy.ai/en/webapp/guides/prompting) recommends a clear subject, material, style and technical constraints, with minimal geometry for game assets. Each complete prompt below is under its documented 800-character limit. Its [current help guide](https://help.meshy.ai/en/articles/11972484-meshy-prompt-guide-best-practices-and-templates-by-asset-type) directs text prompts to Meshy Agent; the same descriptions can accompany a selected image.

Use Smart Topology where available. Check the actual exported triangle count: [Meshy's remesh guide](https://docs.meshy.ai/en/webapp/guides/3d-model/remesh) currently limits free-plan remesh targets to 10K, which is far above these repeated-detail budgets. Availability depends on the chosen model/workflow. A low-poly appearance alone does not establish low geometry cost.

Export static GLB models after applying scale, checking normals and setting a ground-contact pivot. Author in metres, then use the existing Editor centimetre import boundary. Prefer one shared opaque material/palette per family; do not allocate a unique large texture to every stone or tuft. Preserve authored source files, generator/plan provenance and original exports with their Blender derivatives.

Rocks need complete geometry, including their underside. Slight burial can hide the contact seam. Plants need real folded/wedge geometry, including readable side/back views, with no alpha-card grass. Match the approved protagonist's broad matte finish through runtime materials and lighting; do not bake a directional shadow into the colour texture.

**S1–S3 are optional shape studies.** Their generated endpoints, slopes, UVs and dimensions must be fitted to a shared template in Blender before modular use. Prefer generating the continuous bank/basin from the authored water-cell outline for dependable seams. Keep the moving water surface separate from all bank meshes. Do not ask Meshy for a complete lake with a permanently attached water surface.

| ID | Asset | Proposed size | Final triangle target | Batch |
| --- | --- | --- | --- | --- |
| R1 | Squat pebble | 0.12–0.20 m across | 24–40 | First batch |
| R2 | Chipped wedge stone | 0.20–0.35 m across | 32–64 | First batch |
| R3 | Flat notched stone | 0.25–0.45 m across | 32–64 | First batch |
| R4 | Twin-lobed stone | 0.25–0.40 m across | 48–80 | Expansion |
| R5 | Compact pebble cluster | 0.40–0.65 m across total | 96–160 total | Expansion |
| R6 | Loose chip cluster | 0.30–0.50 m across total | 48–96 total | Expansion |
| P1 | Pioneer sprout | 0.10–0.18 m tall | 12–24 | First batch |
| P2 | Asymmetric fan tuft | 0.18–0.28 m tall | 24–40 | First batch |
| P3 | Full grass clump | 0.22–0.35 m tall | 36–64 | Expansion |
| P4 | Dry and green tuft | 0.18–0.30 m tall | 24–48 | Expansion |
| P5 | Compact low shrub | 0.30–0.45 m tall; 0.45–0.65 m wide | 80–140 | First batch |
| P6 | Groundcover rosette | 0.08–0.15 m tall; 0.30–0.50 m wide | 30–60 | First batch |
| S1 | Straight bank shape study | Approx. 2 m long; profile fitted in Blender | 80–160 | Optional shape exploration |
| S2 | Outside bank corner shape study | Approx. 2 × 2 m; joints fitted in Blender | 120–220 | Optional shape exploration |
| S3 | Inside bank corner shape study | Approx. 2 × 2 m; joints fitted in Blender | 120–220 | Optional shape exploration |

## R1 Squat pebble

Size: 0.12–0.20 m across. Final target: 24–40 triangles. [Concept reference](images/04-rock-scatter.png).

```text
One small squat asymmetrical pebble, slightly flattened rounded wedge, just a few broad polygon planes. Warm grey and muted blue-slate stone, broad irregular facets, non-metallic, no pores, cracks, moss or crystals. Flat stable underside suitable for slight burial, complete sides and underside. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## R2 Chipped wedge stone

Size: 0.20–0.35 m across. Final target: 32–64 triangles. [Concept reference](images/04-rock-scatter.png).

```text
One low asymmetrical wedge-shaped stone, pointed at one end, blunt chipped corner at the other, low triangular silhouette. Warm grey and muted blue-slate stone, broad irregular facets, non-metallic, no pores, cracks, moss or crystals. Flat stable underside suitable for slight burial, complete sides and underside. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## R3 Flat notched stone

Size: 0.25–0.45 m across. Final target: 32–64 triangles. [Concept reference](images/04-rock-scatter.png).

```text
One thin broad flat shale-like stone, irregular polygon outline, one shallow notch along an edge, simple wide top plane, very low height. Warm grey and muted blue-slate stone, broad irregular facets, non-metallic, no pores, cracks, moss or crystals. Flat stable underside suitable for slight burial, complete sides and underside. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## R4 Twin-lobed stone

Size: 0.25–0.40 m across. Final target: 48–80 triangles. [Concept reference](images/04-rock-scatter.png).

```text
One low twin-lobed angular rock, two unequal joined rounded polygon masses with a shallow groove, asymmetrical flatter top. Warm grey and muted blue-slate stone, broad irregular facets, non-metallic, no pores, cracks, moss or crystals. Flat stable underside suitable for slight burial, complete sides and underside. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## R5 Compact pebble cluster

Size: 0.40–0.65 m across total. Final target: 96–160 total triangles. [Concept reference](images/04-rock-scatter.png).

```text
One compact cluster of four close-set low stones: one taller squat stone and three smaller varied pebbles beside it. Four simple solid stone components in one reusable game asset; no connecting soil plinth or gravel bed. Warm grey and muted blue-slate stone, broad irregular facets, non-metallic, no pores, cracks, moss or crystals. Flat stable underside suitable for slight burial, complete sides and underside. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## R6 Loose chip cluster

Size: 0.30–0.50 m across total. Final target: 48–96 total triangles. [Concept reference](images/04-rock-scatter.png).

```text
One reusable loose cluster of four tiny stone chips, uneven sizes and irregular spacing, low angular silhouettes. Four separate solid chips grouped as one asset, no connecting ground slab, no filler gravel. Warm grey and muted blue-slate stone, broad irregular facets, non-metallic, no pores, cracks, moss or crystals. Flat stable underside suitable for slight burial, complete sides and underside. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## P1 Pioneer sprout

Size: 0.10–0.18 m tall. Final target: 12–24 triangles. [Concept reference](images/05-vegetation-scatter.png).

```text
One tiny pioneer grass sprout with exactly three broad simple blades of unequal height, open asymmetric silhouette, gently folded blade centres. Muted olive and sage greens, matte opaque surfaces. Real simple folded or wedge-shaped leaf geometry, no alpha cards, crossed billboards or hairlike strands. No pot, soil disk, rocks, flowers or tall stems. Gathered ground-level root origin. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## P2 Asymmetric fan tuft

Size: 0.18–0.28 m tall. Final target: 24–40 triangles. [Concept reference](images/05-vegetation-scatter.png).

```text
One short asymmetric grass fan with five broad tapered folded blades, an off-centre tallest blade and two low outward side blades. No dense mass of fine leaves. Muted olive and sage greens, matte opaque surfaces. Real simple folded or wedge-shaped leaf geometry, no alpha cards, crossed billboards or hairlike strands. No pot, soil disk, rocks, flowers or tall stems. Gathered ground-level root origin. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## P3 Full grass clump

Size: 0.22–0.35 m tall. Final target: 36–64 triangles. [Concept reference](images/05-vegetation-scatter.png).

```text
One squat full grass clump with seven broad tapered folded blades, varied heights and lean directions, clear open spaces between large leaf shapes, compact root footprint. Muted olive and sage greens, matte opaque surfaces. Real simple folded or wedge-shaped leaf geometry, no alpha cards, crossed billboards or hairlike strands. No pot, soil disk, rocks, flowers or tall stems. Gathered ground-level root origin. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## P4 Dry and green tuft

Size: 0.18–0.30 m tall. Final target: 24–48 triangles. [Concept reference](images/05-vegetation-scatter.png).

```text
One irregular transition grass tuft with five broad simple folded blades, two muted straw-colour blades and three olive-green blades, asymmetric low fan silhouette. Muted olive and sage greens, matte opaque surfaces. Real simple folded or wedge-shaped leaf geometry, no alpha cards, crossed billboards or hairlike strands. No pot, soil disk, rocks, flowers or tall stems. Gathered ground-level root origin. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## P5 Compact low shrub

Size: 0.30–0.45 m tall; 0.45–0.65 m wide. Final target: 80–140 triangles. [Concept reference](images/05-vegetation-scatter.png).

```text
One squat compact shrub made of only six to eight broad chunky angular leaf forms around a short mostly hidden stem. Unequal leaf masses, rounded low silhouette, wider than tall. No dozens of individual tiny leaves. Muted olive and sage greens, matte opaque surfaces. Real simple folded or wedge-shaped leaf geometry, no alpha cards, crossed billboards or hairlike strands. No pot, soil disk, rocks, flowers or tall stems. Gathered ground-level root origin. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## P6 Groundcover rosette

Size: 0.08–0.15 m tall; 0.30–0.50 m wide. Final target: 30–60 triangles. [Concept reference](images/05-vegetation-scatter.png).

```text
One low spreading groundcover rosette with six broad simple faceted leaf forms, arranged asymmetrically close to the ground, much wider than tall, varied leaf lengths. Muted olive and sage greens, matte opaque surfaces. Real simple folded or wedge-shaped leaf geometry, no alpha cards, crossed billboards or hairlike strands. No pot, soil disk, rocks, flowers or tall stems. Gathered ground-level root origin. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## S1 Straight bank shape study

Size: Approx. 2 m long; profile fitted in Blender. Final target: 80–160 triangles. [Concept reference](images/03-water-levels.png).

```text
One simple low-poly straight earthen shoreline segment. A level ground lip at the back, a chamfered ochre soil edge, a broad gentle sloped bank descending to a low flat basin-floor strip in front. Constant shallow profile along its length, flat ends, no isolated floating pieces. Ochre dry soil and muted umber earth, very simple broad planes. No water surface, foam, plants, rocks, cliff towers or complete lake. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## S2 Outside bank corner shape study

Size: Approx. 2 × 2 m; joints fitted in Blender. Final target: 120–220 triangles. [Concept reference](images/03-water-levels.png).

```text
One simple low-poly convex outside corner of an earthen shoreline: a low land corner projecting into a basin, with sloped banks along two adjacent sides meeting around the projecting corner. Level land top, chamfered soil lip, shallow lower basin-floor apron. Match a simple straight-bank profile. Matte ochre and umber soil planes. No water surface, foam, vegetation, rocks or complete lake. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## S3 Inside bank corner shape study

Size: Approx. 2 × 2 m; joints fitted in Blender. Final target: 120–220 triangles. [Concept reference](images/03-water-levels.png).

```text
One simple low-poly concave inside corner of an earthen shoreline: a recessed basin corner where two gently sloping earth banks meet at a right angle around a low basin-floor area. Level ground rim, chamfered lip, shallow continuous slopes. Match a simple straight-bank profile. Matte ochre and umber soil planes. No water surface, foam, vegetation, rocks or complete lake. Stylized very low-poly 3D game asset for an angled-overhead restoration game. Broad matte colour areas, simple flat facets, clean edges and minimal geometry. One isolated asset, centered, neutral background, no text, no display base, no baked lighting or cast shadows, no realistic surface noise.
```

## Base surfaces use a texture workflow

The [ground-variation board](images/02-ground-variants.png) is a colour/variation study, not a seamless texture atlas. Prepare four dry-soil variants, four restored-groundcover variants, two damp-soil variants and two mineral-soil variants in 2D; share neutral edge treatment within compatible families and blend across material-family boundaries. Avoid placing recognisable stones, blades, strong cracks or directional lighting into these base textures.

Check every allowed neighbour pairing at 0°, 90°, 180° and 270°, including mipmapped distance views. Individually seamless textures do not automatically join seamlessly to different variants. Rotation/shuffling needs compatible edges or controlled edge blending; macro patches and 3D scatter then hide longer repeating patterns.
