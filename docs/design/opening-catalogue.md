# Opening crafting and research catalogue

Revised 28 October 2026. The research order, safe-handcrafting boundary and initial inventory/salvage settings below are agreed. Recipe quantities/work durations and later complex-item stack limits remain provisional playtest values, not final balance or implemented content. The [progression specification](player-progression.md) owns the agreed rules.

The [Fibery catalogue](balance/README.md) stores the linked records. Whiteboard layouts and annotations were deliberately left unchanged for this revision; consult the database relationships and this document for the current tree.

## Agreed opening boundary

Start with gathering and timed field research, empty possessions and no unlocked recipes. Research every crafting capability. Every researched assembly recipe using safe components remains handcraftable throughout progression; item tier and ingredient count do not impose an artificial machine-only restriction. Processing liquids, hazardous substances or dangerous outputs requires suitable machinery. A safe finished component can be assembled by hand even when manufacturing that component required specialist equipment. Assembling an empty pump from safe parts is different from processing liquids through it.

Handcrafting uses prepared ingredients rather than automatically crafting missing intermediates. The player learns plates/wire, then parts, before building the MiniFab as the first complex four-ingredient device. Its background production and automatic eligible precursors are the reward for those lessons. Personal recovery stays deterministic; industrial recycling still produces a mixed stream for logistics to sort.

Handcrafting is active work confined to its visible UI. Simple recipes must be quick. A selected batch requires no repeated click per unit, but leaving/closing/hiding the UI or starting conflicting work cancels the job. Warn before an intentional exit; keep the UI/work suspended while the player chooses whether to stay or cancel and leave. The active batch protects result/refund capacity; other additions/transfers and MiniFab deliveries wait. Enabled background Field Research may consume uncommitted bag stock, but never the current unit's ingredients or occupy its protected space. On cancellation, keep every completed item and refund the original ingredients of the unfinished item before releasing that ownership, releasing any unstarted reservations. No outside event can consume result/refund capacity, so handcraft cancellation never needs ground overflow. Do not dismantle completed output, produce a partial item, award cancelled production or silently resume the batch later. If ten plates are finished and plate eleven is in progress, keep any of the ten completed plates not already consumed by enabled research and refund plate eleven's scrap. Exact interruption/refund invariants are in [handcrafting](player-progression.md#handcrafting-and-interruption).

## Core research tree

Technology topology, unlocks and payment material families are agreed. Amounts and field-work times below are retained/updated playtest values. Each material quantity is initially both cumulative eligibility and the stock contribution; scrap uses extraction history and crafted inputs use production history. Research preserves those histories and never pays for construction automatically. Enabled Field Research draws materials directly from uncommitted inventory over time while the player performs other work; shortages wait/resume automatically. Pausing or changing the active technology retains all work/contributions, with no cancellation or reclamation of consumed items. Turning Field Research off prevents bag withdrawals even when labs run; enabling it allows inventory contributions alongside labs. Each timed cycle consumes one of each still-required resource together; if any is missing, the whole cycle waits. Finished material costs are not charged again. Partial work is retained, costs/work intervals remain provisional, and no catch-up work accrues during shortages.

| Technology | Prerequisites | Research payment | Field work | Unlocks |
| --- | --- | --- | --- | --- |
| Improvised tools | None | 4 scrap | 6 s | Scrap prybar hand-assembly recipe |
| Material recovery | Improvised tools | 8 scrap | 12 s | Plates and recovered wire, handcraftable before a MiniFab exists |
| Mechanical assembly | Material recovery | 4 plates | 15 s | Handcrafted mechanical parts |
| Electrical assembly | Material recovery | 4 plates + 6 wire | 20 s | Handcrafted electrical parts |
| Mini fabrication | Mechanical assembly + Electrical assembly | 1 mechanical part + 1 electrical part | 12 s | Four-ingredient MiniFab hand assembly, panel and optional winding |

Mechanical and electrical assembly are sibling branches. Tutorial guidance introduces mechanics first, then electrics; either can be researched first once Material recovery is complete. The MiniFab requires both. Researching Improvised tools is the dependency; tutorial guidance also teaches crafting/equipping the prybar, without consuming the tool as research payment.

```text
Collected scrap
  +-- Improvised tools --> craft and use prybar
        +-- Material recovery --> handcraft plates and wire
              +-- Mechanical assembly --> handcraft mechanical parts --+
              +-- Electrical assembly --> handcraft electrical parts --+--> Mini fabrication
                                                                            +-- hand-assemble MiniFab
                                                                            +-- later MiniFab upgrades
```

This replaces the earlier scrap-only, independent-root MiniFab proposal. Factory electricity, power generation and an existing fabricator are not bootstrap requirements. The built MiniFab retains its power-free baseline and optional winding boost.

The two optional upgrade branches remain later candidates, not additional Milestone 3 delivery requirements:

| Technology | Prerequisites | Research payment | Field work | Separately crafted result |
| --- | --- | --- | --- | --- |
| MiniFab crank gearing I | Mini fabrication + Mechanical assembly | 2 mechanical parts + 2 wire | 20 s | Reduces recharge turns from five toward a one-turn cap; tier spacing/costs later |
| MiniFab charge storage I | Mini fabrication + Electrical assembly | 2 electrical parts + 2 wire | 20 s | First repeatable +50% capacity level; costs double each level, no level cap |

All MiniFab upgrade branches require Mini fabrication and their related technology. General research, MiniFab-specific research, crafting and applying the actual upgrade remain separate steps. Later power-source coexistence and stacking remain open. The initial battery gives 60 active seconds at 2x speed, needs five turn-equivalents to fill and drains only during actual crafting. Fractional/reversed handle travel earns proportional charge via pointer, selected right stick or directional keys. Capacity level n lasts 60 * 1.5^n active seconds; physical level-n upgrade cost is B * 2^(n-1). Gearing reaches one turn per full recharge and turns-to-full stays independent of capacity. Initial upgrade recipes B remain provisional; unlimited capacity levels do not become free or implemented.

## First recipes

Each recipe produces one result per completed unit. Work times are unboosted playtest values. Handcrafting consumes the player's active work while its UI remains open; the MiniFab can run while the player performs other work. The MiniFab's precursor jobs add their own work time. Missing intermediates are not automatically made by handcrafting.

| Result | Ingredients | Executors after recipe research | Work time | Proposed stack limit |
| --- | --- | --- | --- | --- |
| Scrap prybar | 4 scrap | Handcraft; MiniFab once built | 4 s | 1 |
| Metal plate | 2 scrap | Handcraft; MiniFab once built | 2 s | 100 |
| Recovered wire | 1 scrap | Handcraft; MiniFab once built | 1 s | 100 |
| Mechanical part | 2 plates | Handcraft; MiniFab once built | 4 s | 100 |
| Electrical part | 1 plate + 2 wire | Handcraft; MiniFab once built | 6 s | 100 |
| Base MiniFab | 2 plates + 2 wire + 1 mechanical part + 1 electrical part | Hand assembly after Mini fabrication | 12 s | Personal subsystem; no inventory stack |
| MiniFab crank gearing I | 2 mechanical parts + 2 wire | Handcraft or MiniFab after its specific research | 20 s | One crafted module; apply once |
| MiniFab charge storage I | 1 mechanical part + 2 electrical parts + 2 wire | Handcraft or MiniFab after its specific research | 30 s | One crafted module; apply once |

The initial inventory/reach rules are now agreed: 24 bag slots plus a separate equipped-tool slot, no weight, configurable 100-item stacks for simple materials, and a 2 m radial interaction range with later upgrades. Salvage overflow goes to the ground with feedback. Craft starts check capacity after actual input consumption; MiniFab draws one operation's inputs just before starting and commits results into its own buffer (initially one complete recipe result). It pauses when that buffer is full and inventory cannot accept output; direct precursor use or validated next-input ingestion may make room, without hidden storage. Automation cannot claim slots against the player. Initial salvage settings are agreed: hold-to-repeat with a toggle alternative, one scrap per 3 seconds by hand and one per second with the prybar. The first handcrafted prybar auto-equips into an empty tool slot; later replacements are explicit. Merge nearby ground drops and use deliberate pickup. Durability is only a potential later mechanic, unused in the opening. Module fitting/removal and duplicate-upgrade handling remain open.

## Recipe families and factory compatibility

| Process or recipe | Personal capability | Industrial capability |
| --- | --- | --- |
| Select scrap to plate or wire | Researched safe hand recovery; MiniFab personal recovery | Recycler produces a random mixture; no deterministic general-fabricator recovery bypass |
| Plates to mechanical parts | Handcraft or MiniFab | Basic Fabricator: exactly one distinct ingredient type |
| Plate and wire to electrical parts | Handcraft or MiniFab | Medium Fabricator: exactly two distinct ingredient types |
| Safe equipment, modules and research craftables | Handcraft after research; compatible MiniFab recipes | General fabricator for the recipe's exact arity; throughput incentivises automation |
| Mixed industrial recycling | Not an automatic personal precursor recipe | Recycler with output sorting |
| Liquids, hazardous production and specialist treatment | Not handcraftable or available to initial MiniFab; later researched/crafted handling upgrades may enable suitable MiniFab processes | Appropriate dedicated machinery |

Basic accepts exactly one input type, Medium exactly two, and Advanced three or four; quantities do not change arity. These restrictions apply to general fabrication machines, not handcrafting or the personal MiniFab. Safe research craftables are not factory-only merely to force automation. Assess their actual ingredients/process; unsafe processes require suitable machinery or later specifically upgraded MiniFab capability.

## Bridge into the first factory

This continuation checks reachability and is not extra Milestone 3 scope. Payments, equipment recipes and durations remain unspecified.

| Branch | Proposed prerequisite path | Capability gained |
| --- | --- | --- |
| Electrical engineering | Mechanical + Electrical assembly | Connections and renewable-generation research |
| Solar power / Wind power | Electrical engineering; separate siblings | First generation choices, supporting a coal-free route |
| Mixed recycling | Mechanical + Electrical assembly | Mixed-output recycler; construction and operating electricity are separate |
| Basic fabrication | Mechanical assembly | Single-input fabrication |
| Medium fabrication | Basic fabrication + Electrical assembly | Two-input fabrication |
| Extraction | Mechanical assembly | Powered extraction |
| Sorting and conveyors | Mixed recycling + Mechanical assembly | Direct transport, sorting and filters |
| Laboratory research | Medium fabrication + Electrical assembly | Scalable lab work and first dedicated research-craftable recipe |

The first lab, first Medium Fabricator and laboratory research must be paid for with existing components rather than their own research craftables. Safe kit assembly can remain manual; labs provide scalable research throughput. Exact field/lab compatibility remains open. No required machine may need its own output to be unlocked/built. Advanced fabrication and trains remain later content.

## Material-value and pacing checks

For the draft ledger, scrap is one value unit, plate two, wire one, and each mechanical/electrical part four. Dismantling returns 4 scrap for the prybar, **14 for the revised MiniFab**, 10 for crank gearing and 14 for charge storage. Every recipe's output value equals its input value. Cancellation returns the unfinished unit's original ingredients; dismantling an already crafted item returns its scrap value. Research-consumed materials are permanently invested and cannot be reclaimed. Every completed re-craft counts as production; refunds/transfers/dismantling do not. Later non-scrap solids recover as their source ores for full reprocessing, while liquids are lost; those detailed equivalences are future content.

Using the trial collection rates, no overlap/boost, and serial uninterrupted jobs (excluding UI, movement and tutorial time):

- Research and craft the prybar: **8 scrap, 34 seconds**.
- Research all five technologies and build the MiniFab: **60 scrap, 221 seconds** (76 gathering + 65 field research + 80 crafting).
- Complete the first MiniFab-produced plate: **62 scrap, 225 seconds**.
- Finish with the prybar, built MiniFab and one retained mechanical/electrical part each: **68 scrap, 247 seconds**.

These serial, no-overlap arithmetic checks establish reachability, not measured playthroughs. Background research now permits overlap with gathering/crafting; they are not minimum elapsed times, with synchronized one-of-each remaining-input consumption cycles and whole-cycle waiting for shortages. Keep the relaxed 15–20 minute and experienced under-five-minute first-automatic-craft targets as playtest goals; do not turn them into mandatory waits. These totals use the agreed initial 3 s / 1 s collection rates. Recipe/research quantities and work times remain provisional, and the complete route still needs playtesting.

## Implementation readiness

The opening order, safe handcrafting boundary and UI-exit cancellation rule are agreed. Inventory capacity, stack policy, initial reach, salvage overflow and player-first crafting-capacity behavior are settled; salvage controls/rates, first-tool behavior and the handcraft refund-capacity invariant are also agreed. Inventory/salvage/tool design is complete with a configurable starter-area budget of 250,000 scrap; distribution and later tuning belong to Milestone 3 authoring. Field Research behavior design is complete: background work, gradual direct bag consumption, enabled-only inventory contribution alongside labs, synchronized one-of-each remaining-input cycles, whole-cycle shortage waiting and permanent progress on pause/switch are agreed. Durability is potential later work only. MiniFab queue/buffers/recovery are agreed: per-operation inventory intake, one-operation input/output capacity, direct precursor use, retained cancellation buffers and same-input-type replacement rules. Winding/charge behavior and all five opening design tasks are complete; Milestone 3 gameplay implementation remains pending. Buffer upgrades, advanced portable recipes and detailed ore/liquid recovery remain later design work. Later factory costs, research-kit recipes and upgrade fitting follow their own milestones. Numerical values in this catalogue remain visibly provisional.

The final readiness review settles stock contention as manual actions/current handcraft commitment, requested MiniFab, then Field Research. Disassembly requires room for the entire body return and intact buffers; a capacity block leaves item/device/job/contents intact with no partial recovery or spill. See the [Milestone 3 scope checklist](../plans/milestone-03-character-and-manual-opening.md#implementation-readiness-and-scope): five core technologies/six opening recipes now; optional upgrades and advanced systems later.
