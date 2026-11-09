# Milestone 5 research catalogue

Implemented 8 November 2026. Quantities, durations, lab rates and construction costs below are **provisional playtest balance**. [Fibery](balance/README.md) owns connected authoring; the reviewed runtime data is [first-factory.ts](../../src/content/first-factory.ts), composed with the five-technology opening in [opening.ts](../../src/content/opening.ts). Milestone 5 delivered 14 paid technologies and seven recipes. Milestone 6 adds eight paid equipment assemblies and physical factory/lab operation, bringing the runtime to 15 recipes; see the [factory catalogue](factory-catalogue.md). Sorting/conveyor execution remains Milestone 7.

## Paid continuation

Each listed payment also requires the same lifetime **produced** quantities. The existing opening uses separate extracted-scrap history where appropriate. History never pays a research cost: current inventory must still supply the paced bundles. All prerequisites in a row are required.

| Technology | Prerequisites | Payment / lifetime eligibility | Fully supplied field work |
| --- | --- | --- | --- |
| Electrical engineering | Mechanical assembly, Electrical assembly | 2 mechanical parts + 2 electrical parts | 30 s |
| Solar power | Electrical engineering | 6 plates + 4 wire + 2 electrical parts | 40 s |
| Wind power | Electrical engineering | 6 plates + 3 mechanical parts + 1 electrical part | 40 s |
| Mixed recycling | Mechanical assembly, Electrical assembly | 6 plates + 3 mechanical parts + 2 electrical parts | 45 s |
| Basic fabrication | Mechanical assembly | 4 plates + 2 mechanical parts | 25 s |
| Medium fabrication | Basic fabrication, Electrical assembly | 2 mechanical parts + 2 electrical parts | 35 s |
| Extraction | Mechanical assembly | 4 plates + 3 mechanical parts | 35 s |
| Laboratory research | Medium fabrication, Electrical assembly | 2 mechanical parts + 3 electrical parts | 45 s |
| Sorting and conveyors | Mixed recycling, Mechanical assembly, Laboratory research | 4 Basic research kits | 60 s |

Laboratory research also unlocks the Basic research kit recipe. Its recipe is **1 mechanical part + 1 electrical part → 1 kit in 8 seconds**. It is safe to handcraft or request from the power-free MiniFab, including automatic eligible precursors. Stack limit is 50 and solid value is 8 scrap, exactly its embodied inputs. Future Medium fabrication supports its two distinct ingredient types. Basic accepts exactly one input type; Medium exactly two; future Advanced three/four only. General fabrication cannot bypass mixed recycling by executing the personal plate/wire recovery recipes.

The kit-funded Sorting and conveyors technology demonstrates the next research-cost stage. Its existing authoring identity `future.logistics` is preserved, with Laboratory research added as a prerequisite so kits are reachable first. Milestone 7 implements its paid conveyors and sorter.

## Restoration continuation

M8 adds Energy storage, Water treatment, Greenhouse restoration, optional Coal power and Pollution mitigation with 4/6/8/4/6 Basic-kit costs and 50/60/80/50/60 field seconds. The [restoration catalogue](restoration-catalogue.md) records prerequisites, construction inputs and operating values. Coal retains its existing authoring identity; storage/water/greenhouse/mitigation have deliberate new identities. Research unlocks blueprints and never grants free machines.

## Construction blueprints

These are separate, provisional construction costs displayed with the unlock. Research grants a blueprint, never a free object. Milestone 6 implements crafting, placement and operation using these costs.

| Blueprint | Construction inputs |
| --- | --- |
| Power connection | 1 plate + 2 wire |
| Solar panel | 4 plates + 2 wire + 2 electrical parts |
| Wind turbine | 4 plates + 3 mechanical parts + 1 electrical part |
| Mixed-output recycler | 6 plates + 3 mechanical parts + 2 electrical parts |
| Basic Fabricator | 4 plates + 2 mechanical parts |
| Medium Fabricator | 4 plates + 2 mechanical parts + 2 electrical parts |
| Extractor | 4 plates + 3 mechanical parts + 1 electrical part |
| Laboratory | 4 plates + 2 wire + 2 mechanical parts + 3 electrical parts |

The first Medium Fabricator, lab and their research/kit unlocks require only existing components. No machine needs its own output, research kit or coal to unlock/build itself. All eight equipment assemblies remain available by hand and through the MiniFab. The catalogue validator audits technology/recipe cycles, unique IDs, positive priced work/costs, material conservation and resource/unlock reachability, including these construction inputs.

The [Milestone 6 implementation](../plans/milestone-06-first-working-machines.md) supplies all eight researched equipment types, Basic/Medium fabrication, scrap-only extraction and manually supplied labs. The [factory catalogue](factory-catalogue.md) and [Fibery receipt](balance/milestone-06-revision-2026-11-08.json) record work, stacks, footprints, buffers and power values. The recycler supplies bounded random plates/wire with solid-value scrap remainder; wired networks share power proportionally. Blueprint inputs, shared queue/payment semantics and safe handcrafting remain the same.

## Shared queue and source coordination

The player owns one ordered queue and every field/lab source follows its head. Add/remove/move commands validate IDs, completed/duplicate entries and bounds before mutation. Queueing future technologies is allowed; a head with unmet prerequisite/history requirements waits in order. Removing a prerequisite entry does not complete that prerequisite or silently reorder dependent work. Empty queues are idle.

All technology ledgers survive removal/reordering, including the current task. Re-adding resumes consumed-material investment, completed work and partial cycle time. Completion grants the unlock once, removes the head and stops research for that simulation step; remaining source time is discarded rather than spilling into another technology. Field enable/pause controls only bag contributions. The UI provides native keyboard-operable move/remove buttons, stable focus and text states alongside progress indicators.

The plain [research rules](../../src/simulation/domain/research.ts) accept locally supplied workers. Physical labs use **four input slots and up to 4× field work rate** each, scaled by allocated power. Supplied labs are ordered by stable ID, then Field Research; application manual/current-handcraft commitments and requested MiniFab intake still happen before the field draw. Milestone 6 provides power and local buffer transfers; unpowered/disabled sources are omitted from the rule input.

Each source must have the complete next one-of-each still-required bundle in its own inventory before contributing work. Missing inputs do not advance work or accrue debt; stock from multiple sources is never pooled. At the cycle boundary that source atomically pays the bundle and increments contributions once. Paid-in-full materials leave subsequent bundles. No upfront reservation exists in this slice: shared partial cycle work belongs to the technology, not a worker, and a subsequent supplied source may continue it while paying the next full bundle. Source/queue changes therefore cannot strand reserved materials or reassign paid investment. Extra supplied labs add useful work to the same ledger, bounded by the next material payment and final completion.

## Persistence and stable identities

Current content version is `restoration-1`, following the factory/transport revisions; durable envelope schema 1, world snapshot 3 and physics format 3 remain unchanged. Queue order and every ledger, including unqueued technologies, are saved in plain owned state. The old independent `fieldTechnology` selector is replaced by `researchQueue`; there is no second target authority. M8 requires the exact current authored map and rejects changed-map saves before candidate preparation. No old-map migration is required.

The worker supports the explicitly known Milestone 4 `opening-1` revision. It validates the old item/recipe/technology namespace, converts an unfinished active field target into the sole initial queue head, defaults an absent target to an empty queue and runs the current full gameplay/native validators. It retains existing IDs, run identity, stock, committed handcraft inputs, MiniFab buffers/charge, partial research and native physics. Conversion operates on detached data and does not rewrite the committed slot until Save. Unknown versions, malformed namespaces/queues and incompatible physics remain rejected with existing rollback protection. No time advances or inputs repay during conversion. General migrations remain Milestone 9 and save-format optimization remains deferred.

The nine continuation technologies reuse their recorded Fibery `future.*` Source IDs. New kit identities are `item.basic_research_kit` / `recipe.basic_research_kit`, mapped to runtime `research-kit` / `basic-research-kit`. Costs use stable technology/item source pairs. [The revision receipt](balance/milestone-05-revision-2026-11-08.json) records database identities and reconciliation evidence; whiteboard annotations/layout are unchanged.

## Later branches

Advanced fabrication and later MiniFab upgrades remain non-executable roadmap contracts until their own content slices supply costs/recipes. M8 implements paid energy storage, water treatment, greenhouse restoration and optional coal/mitigation; the green dependency route requires no coal. MiniFab upgrades retain separate research, physical crafting/application and eventual autonomous min/max input/output controls.

See the [implementation report](../reports/milestone-05/2026-11-08/README.md) for verification and its limits.
