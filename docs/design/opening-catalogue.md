# Opening crafting and research catalogue

Draft for discussion, 27 October 2026. The [progression specification](player-progression.md) records agreed direction. This catalogue proposes recipe boundaries, technology groups and initial balance numbers; they are not yet approved balance or implemented content. No gameplay implementation is authorized by this draft.

The [Fibery catalogue and trees](balance/README.md) contain the initial catalogue as editable linked records and whiteboards. Keep later approved changes reconciled with this document; importing the catalogue does not approve its balance values.

## Proposed opening boundary

Start with gathering and timed field research available, but no unlocked recipes or equipment. Research every crafting capability. Recommend keeping active hand assembly to the scrap prybar and the base MiniFab; let the MiniFab perform material/component production while the player does other work. Both hand recipes remain available after their unlocks as a recovery route.

The prybar and MiniFab are separate root technologies paid for with collected scrap. The tool is recommended first, but is not a prerequisite for MiniFab research. The MiniFab is assembled from scrap alone and retains its agreed power-free baseline and optional winding boost. Material recovery follows MiniFab research; neither collecting raw scrap nor constructing the MiniFab requires plates or wire.

This handcrafting boundary is a proposal, not a reversal of the already-agreed scrap-only MiniFab bootstrap. Exact opening order relative to the first tool remains a playtest choice.

## Proposed core research tree

All times below are baseline field-research work in active simulation seconds. Each listed material quantity is both the initial cumulative eligibility requirement and the stock paid into that technology; raw scrap uses extraction history, crafted inputs use production history. Contributions preserve those histories. Costs do not include crafting the unlocked item afterward.

| Technology | Technology prerequisites | Research payment | Field work | Unlocks |
| --- | --- | --- | --- | --- |
| Improvised tools | None | 4 scrap | 6 s | Scrap prybar hand-assembly recipe |
| Mini fabrication | None | 8 scrap | 12 s | Scrap-only MiniFab hand assembly, its panel and optional winding capability |
| Material recovery | Mini fabrication | 8 scrap | 12 s | Deterministic personal recovery recipes for plates and wire |
| Mechanical assembly | Material recovery | 4 plates | 15 s | Mechanical parts |
| Electrical assembly | Material recovery | 4 plates + 6 wire | 20 s | Electrical parts |

Research unlocks capabilities and recipes, not free objects. Mini fabrication does not grant a built MiniFab. Material/component recipes cannot run until their own research is complete. The initial winding interaction belongs to the constructed base MiniFab; it has no separate electricity prerequisite.

Dependency outline:

```text
Collected scrap
  +-- Improvised tools --> craft prybar
  +-- Mini fabrication --> assemble MiniFab from scrap
        +-- Material recovery --> plates and wire
              +-- Mechanical assembly --> mechanical parts
              |     +-- MiniFab crank gearing I (optional later branch)
              +-- Electrical assembly --> electrical parts
                    +-- MiniFab charge storage I (optional later branch)

Mechanical + electrical branches support the later placed-factory tree.
```

The two optional MiniFab branches below are candidates for later progression, not added Milestone 3 delivery requirements.

| Technology | Prerequisite general technology | Research payment | Field work | Separately crafted result |
| --- | --- | --- | --- | --- |
| MiniFab crank gearing I | Mechanical assembly | 2 mechanical parts + 2 wire | 20 s | Upgrade improves charge earned per deliberate winding turn; exact effect open |
| MiniFab charge storage I | Electrical assembly | 2 electrical parts + 2 wire | 20 s | Upgrade increases local battery capacity; exact effect open |

These follow the agreed general technology → MiniFab-specific research → craft actual upgrade sequence. They neither add an energy requirement to baseline crafting nor depend on the factory electricity system. Their place relative to factory battery research and future power upgrades is still a content decision.

## Proposed first recipes

Quantities and unboosted work times are starting values for playtesting. Each recipe produces one result. MiniFab time is serial work at baseline speed; missing prerequisites add their own crafting time. Winding and later upgrades can improve it.

| Result | Ingredients | Initial executor | Work time | Proposed stack limit |
| --- | --- | --- | --- | --- |
| Scrap prybar | 4 scrap | Hand assembly after Improvised tools | 4 s | 1 |
| Base MiniFab | 16 scrap | Hand assembly after Mini fabrication | 12 s | Personal subsystem; no inventory stack |
| Metal plate | 2 scrap | MiniFab after Material recovery | 2 s | 100 |
| Recovered wire | 1 scrap | MiniFab after Material recovery | 1 s | 100 |
| Mechanical part | 2 plates | MiniFab after Mechanical assembly | 4 s | 100 |
| Electrical part | 1 plate + 2 wire | MiniFab after Electrical assembly | 6 s | 100 |
| MiniFab crank gearing I | 2 mechanical parts + 2 wire | MiniFab after its specific research | 20 s | One crafted module; apply once |
| MiniFab charge storage I | 1 mechanical part + 2 electrical parts + 2 wire | MiniFab after its specific research | 30 s | One crafted module; apply once |

The proposed prybar doubles collection rate and has no wear in the opening. Trial collection rates are one scrap per two seconds by hand and one scrap per second with the equipped prybar. Use a sustained gathering action rather than a required click per unit. These tool and interaction details are proposals requiring review.

Component stack limits cap the requested final-item batch; they are ceilings, not recommended opening batch sizes. They do not settle player inventory capacity, intermediate storage capacity or automatic inventory-driven policies. Upgrade-module representation/application and duplicate-upgrade handling need a rule before implementation; research alone never applies the module.

## Recipe families and factory compatibility

Recommend distinguishing recovery processes from general fabrication. The MiniFab has a small personal recovery capability for the bootstrap, while the recycler provides industrial mixed-output recovery. This prevents a deterministic factory recipe from making the agreed sorting challenge optional by accident.

| Process or recipe | Personal capability | Later industrial capability |
| --- | --- | --- |
| Select scrap → plate or wire | MiniFab personal recovery | Recycler produces a random mixture; no selected Basic Fabricator recovery recipe in this proposal |
| Plates → mechanical parts | MiniFab | Basic Fabricator: exactly one distinct ingredient type |
| Plate + wire → electrical parts | MiniFab | Medium Fabricator: exactly two distinct ingredient types |
| Researched equipment and modules | MiniFab where tagged as personal fabrication; complexity affects work time | Appropriate general fabricator for a fabrication recipe's exact arity |
| Mixed scrap recycling | Not a MiniFab precursor job | Recycler; sort mixed outputs through logistics |
| Extraction, purification and other dedicated processes | Not automatic MiniFab precursor jobs | Their dedicated machinery |
| Dedicated engineering research craftables | Proposed factory-only transition | Medium Fabricator for a two-input research-kit recipe; exact kit recipe/cost remains open |

Arity is still exactly one input type for Basic, two for Medium, and three or four for Advanced; input unit counts do not affect it. These arity rules apply to general fabrication recipes. Personal recovery and recycler processes are a separate family. This proposed family boundary needs agreement before it becomes an authoritative restriction.

Initially the MiniFab should handle all unlocked recipes explicitly tagged for personal recovery/fabrication, including equipment needed to establish the first factory. It must not invent precursor work for a factory-only recipe. No required machine may need its own output or dedicated research kits to unlock or build it for the first time.

## Bridge into the first factory

This is a proposed continuation to check the opening's usefulness, not additional Milestone 3 scope. Exact factory research payments, equipment recipes and durations remain to be designed.

| Branch | Proposed prerequisite path | Capability gained |
| --- | --- | --- |
| Electrical engineering | Mechanical + Electrical assembly | Power connections and access to renewable-generation research |
| Solar power / Wind power | Electrical engineering, as separate sibling technologies | First generation choices; either supports a coal-free route |
| Mixed recycling | Mechanical + Electrical assembly | Recycler and its mixed-output process; building it and supplying electricity are separate requirements |
| Basic fabrication | Mechanical assembly | General single-input fabrication, initially mechanical parts from plates |
| Medium fabrication | Basic fabrication + Electrical assembly | General two-input fabrication, initially electrical parts from plates/wire |
| Extraction | Mechanical assembly | Powered extraction; operation needs a working power supply |
| Sorting and conveyors | Mixed recycling + Mechanical assembly | Direct transport, output sorting and filters |
| Laboratory research | Medium fabrication + Electrical assembly | Lab and first dedicated engineering-research-craftable recipe |

The first lab, first Medium Fabricator and Laboratory research itself must be paid for with existing basic components, not the research craftable they unlock. Later research can then consume those dedicated craftables. Labs perform work on them faster than field research and scale through additional supplied buildings; exact field compatibility remains open.

Related solar/wind/coal/grid research opens the corresponding MiniFab-specific upgrade research, followed by separate module crafting. Coal remains optional. No early power source, recycler, lab or first fabrication machine may require advanced materials that only that same machine can produce. Advanced Fabricator and three/four-input recipes belong in later content design; they do not replace Basic/Medium machines.

## Material-value check

For this draft, one scrap is one material-value unit. A plate embodies 2 units, wire 1, and each mechanical/electrical part 4. Full dismantling refunds are 4 scrap for the prybar, 16 for the MiniFab, 10 for the crank module and 14 for the battery module. Each result's value equals its ingredients' value, so these craft/dismantle recipes cannot create scrap.

This is an arithmetic consistency check for the draft, not final whole-game accounting. Research-consumed materials, process consumables, random recycler distributions, partial work and repeated-production eligibility still need their separate policies in the [progression specification](player-progression.md#resources-and-dismantling). Refunds themselves never create production/extraction history.

## Opening budget check

Using the trial collection rates and doing all work sequentially, with no winding bonus, overlapping work or interface/travel time:

- First researched and crafted prybar: 8 collected scrap, 26 seconds of gathering/research/assembly.
- First MiniFab-produced plate, taking the prybar first: 42 total collected scrap, 98 seconds of gathering/research/assembly/production.
- Complete all five core technologies and retain one mechanical part and one electrical part, with the prybar and MiniFab built: 70 total collected scrap, 199 seconds (3 min 19 s) of serial work.
- That complete core route contains 78 seconds gathering, 65 seconds field research and 56 seconds crafting; research and construction are both paid.

These calculations establish reachable dependencies and leave room for an experienced under-five-minute first-automatic-craft route. They do not measure an actual playthrough or prove the relaxed 15–20 minute target; movement, tutorial, interface use, exploration, simultaneous work and gathering feedback require playtesting. Those targets are upper pacing goals, not compulsory timers.

## Review decisions

1. Adopt the proposed hand-assembly boundary: prybar and MiniFab by hand; ordinary material/component work through MiniFab afterward?
2. Keep selected scrap recovery personal and industrial recycling mixed, rather than allowing general fabricators to bypass sorting?
3. Review the five core technology groups, recipe quantities/times and 100-unit component stacks as first playtest values.
4. Choose the first factory-only research-craftable recipe and the later module/factory research costs after the opening is agreed.

This catalogue must remain visibly marked as a draft until its proposals are adopted. Do not treat its balance values or new capability boundaries as completed or settled implementation.
