# Scrapworks balance authoring

Configured 28 October 2026. The initial catalogue is now available in the **Scrapworks** space in [Fibery](https://scrapworks.fibery.io/Scrapworks/38).

## Views

| View | Purpose |
| --- | --- |
| [Crafting tree](https://scrapworks.fibery.io/Scrapworks/43) | Live cards for all nine items and eight recipes, organised into hand assembly, MiniFab production and optional modules |
| [Research tree](https://scrapworks.fibery.io/Scrapworks/44) | All 21 technology cards with native prerequisite relationships, grouped into opening, first factory and power branches |
| [Items](https://scrapworks.fibery.io/Scrapworks/38) | Material values, stack policy and personal-system representation |
| [Recipes](https://scrapworks.fibery.io/Scrapworks/39) | Calculated input summary, outputs, work duration, executor and research unlock |
| [Recipe ingredients](https://scrapworks.fibery.io/Scrapworks/40) | Twelve recipe/item pairs with authoritative input quantities |
| [Research](https://scrapworks.fibery.io/Scrapworks/41) | Prerequisites, calculated payment summary, duration, scope and decision basis |
| [Research costs](https://scrapworks.fibery.io/Scrapworks/42) | Ten contributions with separate payment and cumulative eligibility quantities |

There are **60 records in five databases and 24 prerequisite links**. Technology prerequisites use a many-to-many relation, with its inverse Dependent Technologies. All listed prerequisites are required. Two root technologies have no research parent; they still require their scrap eligibility, payment and research work.

The [Fibery project tracker](../../plans/fibery-tracking.md) contains the project's milestones and tasks. Relevant tasks link to catalogue entities through Technologies, Recipes and Items; the inverse Delivery Tasks relation provides a route back to design and implementation work.

## Editing

Use Fibery for connected catalogue and graph authoring. Open a whiteboard card to edit its underlying database entity. Change ingredient quantities in Recipe ingredients and research contributions in Research costs. Recipe Input Summary and Technology Payment Summary are formulas over these records, so their displayed text follows edits. Edit Technology.Prerequisites to change research dependencies.

The research board's dashed connectors are native database relationships. Fibery displays both sides of the self-relation, so use the Prerequisites field to determine direction; the layout progresses from left to right. The crafting board's dashed blue connectors are native output-item relationships. Its solid green material-input arrows are layout annotations derived from the initial Ingredient records: review those arrows when changing a recipe's ingredient set. They are not automatic relation synchronization.

Whiteboard group labels and explanatory text are annotations. They do not approve balance values or change database records. New records must be added to the relevant whiteboard and arranged; this is a freeform canvas, not an automatically generated tree.

## Design status

The [progression specification](../player-progression.md) records agreed direction. The [opening catalogue](../opening-catalogue.md) remains the draft recipe/research proposal. Items, recipes and technologies start in the Draft review workflow; Balance Basis and Decision Basis separately identify draft numbers, agreed capabilities and proposed dependencies.

Future technology costs and durations are null/unspecified, with Payment Summary **Undecided — not free**. No future cost rows were invented. Research starts incomplete. MiniFab is a personal subsystem, not an inventory item, and has no inventory stack. Scrap stack capacity remains unspecified. Research payments are separate from crafting costs and do not reduce cumulative eligibility history.

## Repository and verification

[fibery-import.json](fibery-import.json) records stable source IDs, Fibery entity UUIDs/URLs, view URLs and the initial import validation. It contains no authentication material and is an import receipt, not a live export or synchronization job. The [opening catalogue](../opening-catalogue.md) and [progression decisions](../player-progression.md) preserve the repository design; retired tool trials are covered by the [cleanup recovery record](../../plans/3d-cleanup.md).

The import was checked against all source records: nine items, eight recipes, twelve ingredient records, 21 technologies, ten research costs and all 24 prerequisite pairs. Linked quantities, output/unlock relations and unknown future costs were verified. All eight recipes conserve scrap value; source IDs are unique. The whiteboards use real entity cards inserted through Fibery's interface.

Fibery edits do not automatically update Markdown design or game runtime. Reconcile accepted design revisions into the repository with a reviewed export/diff. Do not rerun the initial import as a blind create: use the recorded Source IDs and UUIDs to update existing records. This authoring setup does not implement or authorize gameplay milestone work.
