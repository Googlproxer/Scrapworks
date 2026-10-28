# Scrapworks balance authoring

Configured 28 October 2026. The initial catalogue is now available in the **Scrapworks** space in [Fibery](https://scrapworks.fibery.io/Scrapworks/38).

## Views

| View | Purpose |
| --- | --- |
| [Crafting tree](https://scrapworks.fibery.io/Scrapworks/43) | Initial entity-card layout; annotations/layout intentionally not updated for the revised opening |
| [Research tree](https://scrapworks.fibery.io/Scrapworks/44) | Initial 21-card layout; native database prerequisites change with records, while layout/annotations remain untouched |
| [Items](https://scrapworks.fibery.io/Scrapworks/38) | Material values, stack policy and personal-system representation |
| [Recipes](https://scrapworks.fibery.io/Scrapworks/39) | Calculated input summary, outputs, work duration, executor and research unlock |
| [Recipe ingredients](https://scrapworks.fibery.io/Scrapworks/40) | Fifteen recipe/item pairs with authoritative input quantities |
| [Research](https://scrapworks.fibery.io/Scrapworks/41) | Prerequisites, calculated payment summary, duration, scope and decision basis |
| [Research costs](https://scrapworks.fibery.io/Scrapworks/42) | Eleven contributions with separate payment and cumulative eligibility quantities |

The current catalogue has **64 records in five databases and 32 prerequisite links**: nine items, eight recipes, fifteen ingredients, 21 technologies and eleven research costs. Technology prerequisites use a many-to-many relation, with its inverse Dependent Technologies. All listed prerequisites are required. Improvised tools is the opening root and still requires scrap eligibility/payment and timed work. Material recovery follows it, mechanical/electrical assembly are siblings, and Mini fabrication requires both. All MiniFab upgrades also require the base Mini fabrication technology plus their related technology.

The [Fibery project tracker](../../plans/fibery-tracking.md) contains the project's milestones and tasks. Relevant tasks link to catalogue entities through Technologies, Recipes and Items; the inverse Delivery Tasks relation provides a route back to design and implementation work.

## Editing

Use Fibery for connected catalogue and graph authoring. Open a whiteboard card to edit its underlying database entity. Change ingredient quantities in Recipe ingredients and research contributions in Research costs. Recipe Input Summary and Technology Payment Summary are formulas over these records, so their displayed text follows edits. Edit Technology.Prerequisites to change research dependencies.

The research board's dashed connectors are native database relationships. Fibery displays both sides of the self-relation, so use the Prerequisites field to determine direction; the layout progresses from left to right. The crafting board's dashed blue connectors are native output-item relationships. Its solid green material-input arrows are layout annotations derived from the initial Ingredient records: review those arrows when changing a recipe's ingredient set. They are not automatic relation synchronization.

Whiteboard group labels and explanatory text are annotations. They do not approve balance values or change database records. When manually revisiting a whiteboard, review its entity cards, annotations and layout; this is a freeform canvas rather than an automatically arranged tree. At the user's request, the 28 October opening revision updates only database entities/relations and leaves both whiteboards alone. Their old annotations may disagree with the revised tree; entity fields and the repository catalogue are authoritative.

## Design status

The [progression specification](../player-progression.md) records agreed direction. The [opening catalogue](../opening-catalogue.md) records the agreed component-led opening and safe handcrafting rules; quantities, stacks and durations remain provisional playtest values. The Recipe Executor option **Handcraft or MiniFab** records both capabilities; these recipes have MiniFab Required unchecked. Handcrafting is UI-bound and refunds only unfinished work; MiniFab background jobs remain independent. Items, recipes and technologies start in the Draft review workflow; Balance Basis and Decision Basis separately identify draft numbers, agreed capabilities and proposed dependencies.

Future technology costs and durations are null/unspecified, with Payment Summary **Undecided — not free**. No future cost rows were invented. Research starts incomplete. MiniFab is a personal subsystem, not an inventory item, and has no inventory stack. Mixed scrap and the simple opening components start at 100 per stack, configured per item; complex items can use smaller caps. Inventory begins at 24 bag slots plus an equipped-tool slot, with no weight. The agreed salvage/crafting capacity rules are in the progression specification. Research payments are separate from crafting costs and do not reduce cumulative eligibility history.

## Repository and verification

[fibery-import.json](fibery-import.json) records stable source IDs, Fibery entity UUIDs/URLs, view URLs and the initial import validation. It contains no authentication material and is an import receipt, not a live export or synchronization job. The [opening catalogue](../opening-catalogue.md) and [progression decisions](../player-progression.md) preserve the repository design; retired tool trials are covered by the [cleanup recovery record](../../plans/3d-cleanup.md).

The original import was checked against all source records: nine items, eight recipes, twelve ingredient records, 21 technologies, ten research costs and all 24 prerequisite pairs. Linked quantities, output/unlock relations and unknown future costs were verified. All eight recipes conserve scrap value; source IDs are unique. The whiteboards use real entity cards inserted through Fibery's interface.

Fibery edits do not automatically update Markdown design or game runtime. Reconcile accepted design revisions into the repository with a reviewed export/diff. Do not rerun the initial import as a blind create: use the recorded Source IDs and UUIDs to update existing records. This authoring setup does not implement or authorize gameplay milestone work.

The [28 October opening revision receipt](opening-revision-2026-10-28.json) records the current 64-record IDs/URLs, 32 prerequisites, replaced scrap-only rows, shared executor option and accepted rules. The initial import receipt remains historical. The revised database was read back and checked for source-ID uniqueness, acyclic prerequisites, reachable paid handcrafting, material conservation and unspecified future costs. All five opening behavior design tasks are Done, including winding/charge; Milestone 3 gameplay implementation remains Open.

The [inventory/capacity revision](inventory-capacity-revision-2026-10-28.json) records the later agreement on 24 bag slots, equipped-tool slot, no weight, configurable simple stacks of 100, 2 m reach, ground salvage overflow and player-priority crafting capacity. Scrap now has a concrete 100-item stack cap. Recipe notes and pending gameplay/save task criteria reflect the rules; record counts and research topology are unchanged. Initial salvage controls/rates and tool direction are now agreed; handcraft inventory exclusivity guarantees refund space. Durability is potential later work only. Inventory/salvage/tools design is complete with a configurable 250,000 total starter scrap; exact placement and tuning remain Milestone 3 authoring. Field Research was the next design task at that checkpoint; all five opening design tasks are now complete.

The [salvage/handcraft clarification](salvage-handcraft-revision-2026-10-28.json) records accepted 3 s / 1 s salvage settings, first-tool behavior, ground pickup and exclusive player-inventory ownership during active handcrafting. Cancellation refunds commit before ownership is released, so there is no handcraft refund-to-ground case. Durability is a potential later mechanic, outside current scope. This superseded the earlier refund-overflow question at that checkpoint. Later Field Research and MiniFab revisions below settle their explicit exceptions and buffer policies.

The [Field Research revision](field-research-revision-2026-10-28.json) records background work, gradual direct inventory consumption, automatic material waiting, enabled-only bag contributions alongside labs and permanent progress/material investment on pause or switch. Research cannot be cancelled or refunded. Enabled research may consume uncommitted bag stock during handcrafting without taking current inputs or protected result/refund capacity. Synchronized cycles consume one of every still-required item together; if any is missing, the entire cycle waits, without partial payment or unpaid catch-up. Completed item-cost totals stop consuming. The behavior design task is Done; implementation remains pending. Catalogue quantities, durations, topology and Draft workflows are unchanged; serial pacing totals are reference arithmetic with overlap now possible.


The [MiniFab buffer/recovery revision](minifab-buffer-recovery-revision-2026-10-28.json) supersedes manual feeding and bag-only output assumptions: the initial device pulls one operation at a time for a player-requested job, with one-operation input/output buffers and direct precursor use. Cancellation keeps ingredients, discards partial work and retains blocked items in buffers; residual input types constrain replacement recipes and uncleared output constrains starting. Initial recipes match handcrafting; hazards/liquids need later upgrades. Scrap-origin solids recover as scrap, other solids as source ore, liquids are lost; completed re-crafts add history while recovery/transfers do not. Advanced field-use niches and exact ore/liquid accounting remain future content. Catalogue counts/topology and provisional balance remain unchanged; no gameplay is implemented.


The [winding/charge revision](winding-charge-revision-2026-10-28.json) records five turn-equivalents to fill, 60 seconds of active crafting at 2x, no idle/paused/blocked drain, and fractional/reversed handle travel across pointer, selected stick and directional keys. Gearing reaches a one-turn full recharge independent of capacity. Unlimited battery levels add 50% capacity with doubling costs; exact base upgrade materials remain provisional, and capacity increases grant no charge refill. All opening design tasks are complete; no gameplay was implemented and whiteboards remain untouched.


The [Milestone 3 readiness review](milestone-03-readiness-2026-10-28.json) confirms no remaining opening gameplay-design blocker, settles MiniFab-before-research stock contention and atomic full-capacity disassembly, and separates later catalogue candidates from the five technologies/six recipes required now. Runtime catalogue/state expansion and first playable authoring remain implementation work; accumulated design changes are uncommitted.


The [ECS sequencing revision](../../plans/ecs-foundation-revision-2026-10-28.json) adds the first Milestone 3 implementation gate: select/prove an actual ECS runtime before new inventory/salvage/research/crafting code. Milestone 4 persists its plain capture/rebuild data; Milestone 6 extends it with factory systems. This changes engineering sequencing, not catalogue records or the five completed opening gameplay-design decisions. No dependency/runtime implementation is installed by the plan revision.
