# Scrapworks reusable UI kit

Updated 11 November 2026, style revision 10. The user accepted the [six screen concepts](../../art/ui/concepts/2026-11-10/redesigns/) as the visual direction and requested reusable pieces with responsive dialogs. The kit follows the [Field Kit concept](../../art/ui/concepts/2026-11-10/redesigns/01-field-kit.png). The current pass makes the dialog background independent of its edge artwork so transparent cutouts expose the scene. This document owns the component and resizing rules. The [Art Document](README.md) owns the wider painted finish.

This delivery contains reference artwork and an isolated layout proof. It does not integrate the new appearance into the game. The geometric SVG sources deliberately separate construction from painted detail; retain the accepted PNG concepts as the finish reference. The preview uses local system fonts; a final licensed display face has not been selected.

## Sources and reference images

- [Component sheet](../../art/ui/kit/v1/previews/components.png), [editable component reference](../../art/ui/kit/v1/reference.html), and [resizable field kit reference](../../art/ui/kit/v1/responsive.html).
- [Original screen captures](../../art/ui/concepts/2026-11-10/before/), [accepted screen concepts](../../art/ui/concepts/2026-11-10/redesigns/), and their [exact image-generation prompts](../../art/ui/concepts/2026-11-10/generation.json).
- [Kit sources and provenance](../../art/ui/kit/v1/README.md), [shared tokens](../../art/ui/kit/v1/tokens.css), and [layout proof styles](../../art/ui/kit/v1/kit.css).

## Construction

Build a dialog from a shell, separate title plate, optional repair pieces, tabs, a content region and an action/status region. Keep all labels, values, icons with meaning and interaction in the application. Artwork supplies the surface, edge and depth.

Use nine-slice artwork: four fixed corners, four strips and a plain centre. Corners preserve their dimensions; top/bottom strips extend horizontally, left/right strips vertically, and the plain centre fills the remaining area. Keep patches, bolts and distinctive chips outside the stretchable strips. Whole-screenshot scaling, non-uniform SVG stretching, and text baked into button art would distort the design and are not the implementation path.

| Piece        | Shared source                                                    | Construction and reuse                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain frame  | [dialog-frame.svg](../../art/ui/kit/v1/sources/dialog-frame.svg) | 256-unit square, slices 64 on all sides; render at 20 CSS px for plain panels. Decorated shells disable this base frame and paint their own inset fill plus edge/corner pieces. |
| Cream face   | [plate-cream.svg](../../art/ui/kit/v1/sources/plate-cream.svg)   | 256×192 source, slices 64; render at 14 CSS px. One square upper-right corner, three different clipped cuts. Secondary buttons, selected tabs and selected toolbar sockets.     |
| Coral face   | [plate-coral.svg](../../art/ui/kit/v1/sources/plate-coral.svg)   | Same cap geometry and metrics as cream. Primary actions.                                                                                                                        |
| Steel face   | [plate-steel.svg](../../art/ui/kit/v1/sources/plate-steel.svg)   | Same cap geometry. Inactive tabs, quiet actions and neutral status plates.                                                                                                      |
| Inset well   | [inset.svg](../../art/ui/kit/v1/sources/inset.svg)               | 64-unit square, slices 12; render at 6 CSS px. Inventory sockets, recipe wells and recessed status surfaces.                                                                    |
| Repair patch | [repair-coral.svg](../../art/ui/kit/v1/sources/repair-coral.svg) | Separate 72:48 piece. Preserve aspect ratio; use at a few structural joins, not on every item.                                                                                  |
| Fastener     | [fastener.svg](../../art/ui/kit/v1/sources/fastener.svg)         | Separate square piece, normally 16–24 CSS px. Fixed size and aspect ratio.                                                                                                      |

The additional pieces restore the concept's distinctive shape language:

| Piece                   | Sources                                                                                                                                                                                                                                                            | Application                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uneven title face       | [title-face.svg](../../art/ui/kit/v1/sources/title-face.svg)                                                                                                                                                                                                       | 256×160 source, slices 48, render at 20 CSS px. Rotate the title and its label together: default −1.5°, alternate +1°.                                                                                                |
| Large title wing        | [title-repair.svg](../../art/ui/kit/v1/sources/title-repair.svg)                                                                                                                                                                                                   | Separate square coral repair, 76 CSS px normally, 64 on intermediate layouts and 56 on compact ones. Reserve label space and preserve its square aspect ratio.                                                        |
| Selected-tab cap        | [tab-repair.svg](../../art/ui/kit/v1/sources/tab-repair.svg)                                                                                                                                                                                                       | Coral 2:3 cap on selected tabs. 36×54 CSS px normally, 30×45 on compact main tabs, 20×30 on compact work-area selectors. Selected labels have dedicated inset space.                                                  |
| Side splice             | [repair-edge.svg](../../art/ui/kit/v1/sources/repair-edge.svg)                                                                                                                                                                                                     | 1:2 coral piece for the dialog's side or another attachment point; the reference uses 32×64 CSS px.                                                                                                                   |
| Repeating border        | [edge-horizontal.svg](../../art/ui/kit/v1/sources/edge-horizontal.svg), [edge-vertical.svg](../../art/ui/kit/v1/sources/edge-vertical.svg)                                                                                                                         | 320×24 and 24×320 CSS px repeating lap-joint tiles. Repeat rather than stretch the pattern. The ornamental edge layer is masked away from the corner cuts.                                                            |
| Four reinforced corners | [top left](../../art/ui/kit/v1/sources/corner-top-left.svg), [top right](../../art/ui/kit/v1/sources/corner-top-right.svg), [bottom left](../../art/ui/kit/v1/sources/corner-bottom-left.svg), [bottom right](../../art/ui/kit/v1/sources/corner-bottom-right.svg) | Distinct long/short upper clamps and folded lower shoes; the lower-right shoe includes a coral repair and fasteners. Preserve each source aspect ratio. Use fixed 72×72, 72×60, 90×60 and 108×78 CSS px respectively. |

Short titles rotate with their plates, including the title lettering, as explicitly requested by the user. Body copy, controls, focus outlines, scrolling regions and grid alignment stay level. Never transform an entire dialog to make it crooked. Reserve space for depth and patches so they cannot be clipped by viewport edges or obscure adjacent targets. Keep border masking on decorative layers; do not clip the content or its focus outlines to the shell's silhouette. Keep footer messages centred clear of the reinforced lower corners.

## Transparent dialog silhouette

The decorated `.shell` disables the filled `dialog-frame.svg` border image. That plain frame remains available for ordinary panel/reference cards, but must not sit behind the decorated shell: its opaque corners and edge strips otherwise show through the ornament's transparent areas.

Paint the opaque centre as a separate decorative surface, inset 24 CSS px from all four outer sides. Paint edge tiles and corner reinforcements around it. The [lower edge](../../art/ui/kit/v1/sources/edge-bottom.svg) is a vertical reflection of the horizontal source, and the [right edge](../../art/ui/kit/v1/sources/edge-right.svg) is a horizontal reflection of the vertical source. This gives each tile an opaque inner join against the centre and a shaped outer contour facing the scene. Preserve their 320×24 and 24×320 CSS px tile sizes.

Use the existing decorative-layer mask to keep edge strips away from the reinforced corners and include the inset centre in that paint layer. The mask applies only to the `::before` artwork, with separate corner/repair overlays in `::after`. It does not clip dialog content, its scroll region, titles or focus outlines. The reserved 20 CSS px layout border remains unchanged.

Each corner source also contains a navy inner face matched to its own diagonal edge. These faces overlap the centre fill and the underside of the reinforcement, closing the narrow seams that a rectangular centre cannot cover. Both decorative pseudo-elements paint below the content, so the corner faces do not cover titles, controls or focus rings. Keep the exterior corner silhouette transparent. The pixel checks cover both horizontal/vertical upper-left joins, both lower-left diagonal joins and the two right-side inner faces at each reference size; these joins must remain fully opaque while exterior cutouts remain transparent.

The [transparent dialog export](../../art/ui/kit/v1/previews/dialog-transparent.png) contains real alpha around the edge cutouts and corners. Local screenshot checks sample two outer corners and cutouts on all four sides at every supported reference viewport, while checking the content centre stays opaque. The normal [wide preview](../../art/ui/kit/v1/previews/dialog-wide-1440x900.png) shows the scene background through those areas.

## Hand crank and border refinement

The hand crank uses three registered 256×256 sources: [housing](../../art/ui/kit/v1/sources/crank-base.svg), [raised arm and axle](../../art/ui/kit/v1/sources/crank-arm.svg), and [cylindrical grip](../../art/ui/kit/v1/sources/crank-grip.svg). The housing has small hex bolts at 12, 3, 6 and 9 o'clock. Its rim uses a single restrained steel bevel and a muted partial highlight; the four bolts and stationary housing shadow remain prominent. The arm retains its bevel, lower side plane and central bearing; the grip has a raised pin, end caps and ribs. Cast-shadow offsets are removed from the moving SVGs. The crank has no repair patch.

Use a 224 CSS px canvas in the wide field kit, 152 px in the intermediate two-column layout and 200 px in the focused compact MiniFab view, maintaining a square aspect ratio. The component board shows a 320 px detail. Arm and grip layers share the 128,128 pivot; the responsive page demonstrates their rotation while the housing and bolts stay fixed.

Wrap the rotating `.crank-moving` group in a stationary `.crank-caster`. Apply the cast shadow to that outer wrapper, after the inner rotation is rendered. The shadow follows the changing silhouette while its light direction remains fixed in screen space: right by 2.7% of the nominal crank size and down by 3.6%, with a hard edge and the shared deep-shadow colour. Do not bake directional cast shadows into the arm/grip images or apply this filter to the rotating group; either would rotate the offset with the handle. Keep material outlines and bevel planes in the SVGs. The [four-angle preview](../../art/ui/kit/v1/previews/crank-shadow-angles.png) shows the result, and [pixel measurements](../reports/ui-art-2026-11-10/crank-shadow.json) verify the offset at 0°, 90°, 180° and 270°.

The [interactive reference](../../art/ui/kit/v1/responsive.html) accepts pointer dragging in either direction and keyboard arrows, with Space/Enter for a quarter-turn and Home to reset. The local 0–60 second counter starts at 24 seconds and gains a full charge from empty in five turns. Idle time adds no charge and does not drain this demonstration battery. Centre crossings, discontinuous pointer jumps and repeated held keys do not add charge. Capture ends on release, cancellation, focus loss, hidden state or resize. State survives compact work-area changes and resizing.

Its [strict TypeScript source](../../art/ui/kit/v1/crank-demo.ts) uses RxJS subscriptions for its event lifecycle and the existing pure `WindingTravel` helper. The [rebuild tool](../../tools/art/build-ui-kit-demo.ts) emits a standalone classic JavaScript bundle for local file previews. This is a presentation demonstration; it does not issue gameplay commands, run the simulation, store progress or replace the production Angular winding control. The component board's crank remains a static construction example.

Horizontal and vertical border tiles now have a 320 CSS px repeat period, replacing the tighter 192 px period. The joint cuts retain their thickness and short bevels while the straight runs are longer. Repeat the new source tiles at their declared size; do not achieve the spacing by stretching the earlier art. The selected-tab coral cap retains its upper/lower cuts but its middle edge is flat rather than spiked.

## Inputs and progress

Text fields follow the pause/save concept: a cream editable face, warm recessed inner edge and a pale outer lip. Dropdowns follow the Field Kit concept: a raised steel face, clipped corners, lower-side depth and a cream arrow. Use clearly visible, deeper corner cuts on text fields, dropdowns and progress tracks. Keep labels and values as live text, with native input/select semantics and a visible external focus outline.

| Piece              | Source                                                               | Construction                                                                                                                              |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Text input surface | [input-face.svg](../../art/ui/kit/v1/sources/input-face.svg)         | 96×96 source, slices 24, render at 8 CSS px. Cream inset treatment, navy text.                                                            |
| Dropdown surface   | [dropdown-face.svg](../../art/ui/kit/v1/sources/dropdown-face.svg)   | 128×112 source, slices 32, render at 8 CSS px. Steel face with distinct bevel and depth.                                                  |
| Dropdown arrow     | [select-arrow.svg](../../art/ui/kit/v1/sources/select-arrow.svg)     | Separate 24×18 source, render at 16×12 CSS px. Decorative wrapper overlay with pointer events disabled; the native select receives input. |
| Progress track     | [progress-track.svg](../../art/ui/kit/v1/sources/progress-track.svg) | 96×64 source, slices 16, render at 4 CSS px. A complete chamfered outline around a recessed track. The bar remains 24 CSS px tall.        |

Do not clip a rectangular CSS border to create progress corners: doing so removes the diagonal joins and produces disconnected edge tips. The track artwork draws each corner continuously. Fill remains inside its padded well, so empty, partial and full states use the same frame. The [input/progress close-up](../../art/ui/kit/v1/previews/inputs-progress.png) includes all three states. Keep the minimum control height at 48 CSS px and reserve arrow space so values cannot overlap it.

## Shared visual rules

| Token       | Value     | Role                                             |
| ----------- | --------- | ------------------------------------------------ |
| Cream       | `#F1E1BD` | Light faces and primary text on navy             |
| Highlight   | `#FFF1CF` | Restrained top bevel and visible focus           |
| Navy        | `#142C40` | Main content face; text on cream, coral and leaf |
| Steel       | `#31495D` | Edge planes, neutral faces                       |
| Coral       | `#F08A65` | Primary action, occasional repair                |
| Leaf        | `#8FA653` | Positive state and filled progress               |
| Deep shadow | `#091D2C` | Solid lower/right extrusion                      |
| Recess      | `#20394C` | Inset content                                    |

Use broad base and shadow planes, clipped corners and sparse surface wear. Keep texture away from text. Reserve chunky display lettering for short titles; body copy and values use a readable sans face. The proof uses local Arial Black / Segoe UI Black for display text; final font selection remains open. Body text starts at 16 CSS px; secondary copy at 14. A 48 CSS px control height is the kit target. Keep body copy and hit areas usable; title type and decorative pieces have declared compact sizes, preserving aspect ratios.

Primary actions use coral with navy text. Secondary actions use cream with navy text. Steel surfaces use cream text. Hover alters the face highlight; pressed artwork can move 2 px within the existing control footprint. Keyboard focus uses a clear external outline. Disabled controls keep the same footprint and use neutral steel plus native disabled semantics. Selection has an explicit selected/current state, a cream face and the coral cap. Normal buttons retain one square corner; do not restore four identical clipped or rounded corners.

Progress shows an adjacent value and label. The unfilled track is neutral; do not colour uncharged capacity coral as if it were another filled state. Keep live status slots tall enough for their normal message, including a second line where expected. Messages may wrap or use their reserved region without moving the adjacent action buttons.

## Responsive dialog rules

Size the layout to its available viewport, including short windows. The dialog has a preferred maximum width, an actual viewport maximum height, and natural content height when it fits. It must not have a fixed aspect ratio. The reference field kit uses a 1120 CSS px maximum width, a 24 px outside gap on larger windows, 16 px on intermediate windows, and 8 px on narrow or short windows. These are proposed starting metrics, not a request to change the existing game's 50vw/50dvh limits in this art-only delivery.

The shell is a four-row layout: header, section navigation, flexible body, footer. The body uses `min-height: 0` and owns the only vertical scroll region. Keep title, Close and essential footer actions visible. A keyboard user must be able to focus and scroll the body. Avoid nested scroll areas inside columns. Keep decorative art out of focus-outline clipping paths.

The compact field kit reserves its viewport-height envelope across work-area changes so its header and footer stay anchored. Natural height remains appropriate for small confirmations and other dialogs with little content.

Prefer fitting and reflow before scrolling: use available width, move columns, shorten repeated guidance, and provide a focused work area on compact layouts. Keep all functionality reachable; do not hide necessary instructions or controls merely to meet a screenshot height. A tall desktop window should not inherit an arbitrary half-viewport dialog height that forces avoidable scrolling.

| Available dialog content width | Field kit arrangement                                                            | Scrolling policy                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| At least 896 CSS px            | Inventory, Handcrafting, Mini Fabricator in three columns                        | Natural height; no scrolling when content fits                                         |
| 608–895 CSS px                 | Inventory left; Handcrafting and Mini Fabricator stacked right                   | Use width before adding vertical length                                                |
| Below 608 CSS px               | One selected work area: Inventory, Crafting or MiniFab; retain all main sections | Single body scroll region when needed; do not stack every work area into one long page |
| Any width, short viewport      | Compact outer spacing and header, same text/control sizes                        | Body scrolls while header/navigation/footer remain available                           |

The proof uses container queries so these thresholds refer to the available dialog content width, not the whole device width. At compact sizes, the additional work-area selector is a proposed presentation of the same inventory/crafting/MiniFab state; switching views must not cancel work or reset form values. The reference demonstrates selection with native radios; future Angular implementation should use the application's accessible navigation and focus conventions.

Other dialogs compose the same pieces:

- Controls: aligned table on wide windows; stacked action/binding rows on narrow windows. No horizontal table overflow. Keep Reset and Save in the footer.
- Pause/save: two content columns when they fit; compact Current game, Recovery and Import views when they do not. Preserve the warning and activation flow. Pin Resume/Close and the current view's essential actions.
- Research: catalogue and queue can sit together on wide screens; make each available as a focused view on compact screens. Reordering and investment state persist across view changes.
- Factory: status grid reduces columns while labels and values stay together. Progress does not need a minimum desktop width.
- Confirmation: naturally sized text with wrapping action buttons; primary and cancel remain visible, and destructive meaning is expressed in the labels.

Production integration must preserve modal focus trapping/restoration, Escape behaviour, accessible names, native form/control semantics, keyboard navigation and the current synchronous cancellation contracts. Frame images are decorative. This reference is not a claim of finished gameplay, mobile input support or tested production dialogs.

## Reference validation

Rendered images live under [kit previews](../../art/ui/kit/v1/previews/); detailed [local validation records](../reports/ui-art-2026-11-10/kit-validation.json) remain ignored under `docs/reports/`. Revision 10 local headless Chromium checks passed at 1440×900, 900×760, 390×844, 320×568 and 1280×480. The first three layouts fit without content scrolling; the last two scroll only inside the body. No document/horizontal overflow occurred, header/footer remained inside the viewport, frame borders stayed at 20 CSS px, and title patches used their declared 76/64/56 CSS px sizes. The title transform and repeating border layers were also recorded. AXE found zero violations on the component board, the five default viewport states and both additional compact work-area states. Local file previews disable AXE's redundant CSS preloading, while leaving computed-style and contrast checks enabled. The record also contains zero page errors and failed requests.

This validates the isolated art/layout proof; each real dialog still needs integration checks after implementation. Browser zoom, other engines, final type and painted detailing remain unqualified.
