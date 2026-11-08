# Milestone 6 First working machines

Implemented 8 November 2026 after review against clean `master` at `647b4f5`. Status: implemented and locally verified, including the toolbar/placement feedback follow-up. Prerequisite: [Milestone 5](milestone-05-research.md), implemented. Its [local verification report](../reports/milestone-05/2026-11-08/README.md) retains its dated scope.

The user authorized full implementation, testing and ongoing documentation/Fibery updates on 8 November. The [factory catalogue](../design/factory-catalogue.md) records authored provisional values; the [implementation report](../reports/milestone-06/2026-11-08/README.md) records tests, built-browser evidence, profiling and limits. Checklist completion records delivered behavior separately from the pre-implementation audit below.

Establish manually supplied renewable-powered recycling, fabrication and laboratory operation, then provide extraction for later continuous supply. The Mini Fabricator's first automatic crafting belongs in Milestone 3; this milestone builds the placed factory. See [player progression](../design/player-progression.md).

[High-level plan](README.md) · [Next milestone](milestone-07-transport.md)

The [progression specification](../design/player-progression.md) owns design decisions; this file owns delivery and verification. Milestone 5 already supplies the Basic kit, shared research queue/rules and fabrication eligibility. This milestone owns physical integration and the functioning coal-free industrial playthrough.

## Delivered implementation

[FactorySystem](../../src/simulation/factory.ts) extends the existing worker with eight paid equipment assemblies, local transfers and atomic recovery, explicit wired solar/wind, seeded conserving recycling, Basic/Medium fabrication, finite extraction and powered shared-queue labs. Angular owns accessible construction/inspection controls; Babylon renders original procedural machine silhouettes and saved wires. The unchanged authored 10 × 10 fixture fits eight placed machines, including two labs, with reachable terminals and a cycle-safe eight-edge network. No layout or free-equipment change was required.

Content `factory-1` persists buffers/jobs/history markers, random sequences, claims and topology, deriving daylight/wind from the saved tick. Known M4/M5 saves upgrade on detached data. Native continuation tests include simultaneous partial production/lab work at night, blocked random results and manual/extractor contention. UI/browser, lifecycle, saves/research and authoring checks retain their own evidence; the full empty-handed industrial route and Save/reload/Continue pass on the production build.

## Pre-implementation audit — 8 November 2026

| Boundary | Existing implementation | Milestone 6 extension |
| --- | --- | --- |
| Authority | One Miniplex 2.0.0 worker, stable IDs, host-owned 20 Hz clock and detached capture/publication in [ecs-runtime.ts](../../src/simulation/ecs-runtime.ts). | Factory components/systems in the same world, retaining bounded detail publication. |
| Content | [first-factory.ts](../../src/content/first-factory.ts) defines nine continuation technologies, eight priced equipment blueprints, kits and exact fabrication eligibility. | Real equipment items/recipes, machine definitions and execution. Blueprints currently grant no craftable or placed equipment. |
| Research | [Shared rules](../../src/simulation/domain/research.ts) implement source-local payment, stable lab-ID order before Field Research and technology-owned partial work. Four-slot/4× labs are tested fixtures. | Feed actual powered lab buffers into that coordinator once per tick. |
| Construction | [Placement](../../src/simulation/placement.ts) supports only the development test building; normal placement is unavailable and every deposit occupies rejected building cells. | Research/item spending, machine footprints, power edges and an explicit extractor/deposit placement exception. |
| Persistence | M4 manual saves, candidate replacement and native physics continuation; M5 saves queue/ledgers and narrowly upgrades known opening saves. | Versioned factory/random/power state and compatible known M4/M5 continuation. |

At review there were no operating factories, placed labs, power networks or material transport. Recycler artwork was reference material. Existing lab/arity fixtures proved reusable rules. The subsequent delivered implementation and verification above establish this milestone's machinery; transport remains Milestone 7.

Extend the [ECS foundation established in Milestone 3](../design/TDD.md#ecs-foundation-from-milestone-3). Library/storage selection, stable IDs, component/resource authority, domain-rule reuse and capture/rebuild boundaries must already be proven before this milestone. Add factory components/systems inside the same simulation step; do not introduce a second world, parallel inventory/recipe engine or a late migration from the opening loop. Babylon remains presentation.

## Agreed scope and decisions — 8 November 2026

1. **Equipment:** solar panel, wind turbine, crafted power connection, mixed-output recycler, Basic Fabricator, Medium Fabricator, scrap extractor and laboratory. Manual supply/collection is sufficient; automatic machine-to-machine material transfers, conveyors and sorting execution belong to Milestone 7.
2. **Material chain:** scrap → random plates/wire → mechanical/electrical parts → Basic research kits → powered labs. The recycler produces no finished parts here. Basic automates one-input mechanical parts; Medium automates two-input electrical parts and kits. Safe equipment assembly remains handcraftable at any arity. General fabricators cannot bypass the recycler with personal plate/wire recovery recipes.
3. **Bounded randomness:** a saved seeded sequence guarantees both plates and wire within a defined maximum batch window. If refined outputs fall short of a batch's solid input value, return the difference as scrap. Every possible outcome conserves input value, not merely the average outcome. Returned scrap is residual input and adds neither extraction nor production history.
4. **Power shortages:** connected networks share available power proportionally across runnable demand, slowing supplied machines together. Zero allocation pauses work. Stable order makes calculation/rounding deterministic; it does not give machines hidden priority. Idle, disabled, missing-input and output-blocked machines have no productive demand; labs need an eligible queue head and their own next material bundle.
5. **Energy boundary:** daylight and variable wind with a positive floor, using simulation state/time. Batteries, Dunkelflaute events, coal/pollution and expanded weather remain Milestone 8. Unused energy is curtailed, never banked. Personal MiniFab baseline/winding stay independent; no fuel or coal is required.
6. **Research:** preserve one shared queue head, local complete bundles and existing technology-owned partial work/payment at synchronized cycle boundaries. There is no upfront lab reservation or separate lab technology job. Keep the provisional four-slot/4× full-power lab defaults; allocated power scales work rate. Queue edits retain every ledger and completion stops research for that tick.
7. **Recovery:** the whole dismantling return must fit the bag or the action changes nothing, including work/connections. Recover body value, connection value, intact buffers and either unfinished original inputs or completed output exactly once. No partial return or ground spill. The current scrap-only solid ledger suffices; research payments remain irreversible.
8. **Later content:** Advanced fabrication (three/four inputs only), pure ores, liquids/hazards and all MiniFab upgrades/autonomous min-max controls remain separate slices. Save-format optimization remains deferred to Milestones 9–10; factory snapshot coverage is required now.

Exact recipe work times, stack/buffer sizes, footprints, cable reach, power ratings, day length, wind curve and recycler weights/window are provisional balance to author in Step 1. Record reviewed values and bootstrap arithmetic in the catalogue before implementing their executors. No further capability decision remains pending from this review.

## Step 1 Define machine content and state

- [x] Reuse the selected Milestone 3 ECS runtime, stable IDs, inventory/recipe/work domain rules and Milestone 4 snapshot adapter. Extend components/queries/systems for factories; do not defer initial ECS selection or rebuild the opening systems here.
- [x] Profile representative factory-scale active/idle machines and projection costs, comparing with the Milestone 3 baseline. Optimize measured storage/query/work scheduling bottlenecks without assuming ECS alone guarantees throughput.
- [x] Turn the eight existing equipment blueprints into researched equipment items/safe assembly recipes with positive work, stack caps, solid values and explicit hand/MiniFab/factory compatibility. Preserve existing Source IDs and reconcile new Fibery catalogue records with reviewed runtime data; research grants no free object.
- [x] Define footprints, quarter-turn orientation, reachable interaction points, collision, material ports, buffer capacities, power terminals and cable reach/cost. Define what one crafted power connection represents and its removal/recovery. Material ports stage Milestone 7; they do not transfer items here.
- [x] Scope extraction to finite scrap deposits. Specify the required overlap/anchor and exclusive deposit claim while preserving other blocker/player/terrain checks. Verify construction/transfer interaction points against the existing 2 m reach, especially for large footprints.
- [x] Basic Fabricator accepts exactly one distinct input type and Medium exactly two. Preserve the future Advanced three/four-input-only contract without delivering that machine here. Mini Fabricator and recycler rules are separate.
- [x] Preserve base components as inputs to advanced branches; later pure ore processing must feed those branches rather than obsolete them.
- [x] Add persistent buffers, selected recipe, enable state, original committed inputs, partial work, pending outputs, history-commit state, deposit claims, power edges and PRNG/shuffle state. Lab work remains in the shared technology ledger. Derive missing-input/no-power/blocked status.
- [x] Author recycler batch inputs, weighted outcomes, maximum availability window, minimum useful refined yield and throughput. Prove `2 × plates + wire + returned scrap = input scrap` for every outcome; returned scrap occupies real output capacity.
- [x] Define consistent watts/joules/seconds, full-power rates, runnable demand, proportional allocation/rounding, daylight/wind curves and initial cycle phase. Prove a paid empty-handed bootstrap budget through both fabricators, separate equipment construction, kits and lab-funded Sorting and conveyors research without batteries or coal.
- [x] Validate all recipe/item/machine/technology references and ensure the first machine in each required chain has an obtainable bootstrap route.

## Step 2 Implement construction, transfer and full recovery

- [x] Extend validated sequenced commands for construction, recipe/enable changes, wiring, transfers and dismantling. Validate unlock, ownership, quantities, reach, terrain, footprint, deposit/port compatibility and current target identity in preview and again at execution. Preview is advisory.
- [x] Consume the crafted equipment item once on successful placement and claim footprint/deposit atomically. Rebuild static/native collision and publish structural changes at the existing safe boundary. Rejected/duplicate commands cannot spend or create twice.
- [x] Support manually loading/unloading permitted buffer items/quantities with capacity feedback; transfers add no histories or ground spills. Respect manual-command priority and handcraft capacity protection; conflicting bag actions follow the existing warning/cancel/refund flow.
- [x] Assign power connections as toolbar placeables. In B build mode, click a first machine then a second, with a live wire preview from the rotated first terminal to the target cell/terminal. Clicking the first cell again cancels without spending; the worker consumes one connector only on a valid completed edge. Clear drafts on slot/world/input/build changes or anchor removal. Reject duplicate/self/invalid edges without spending. Removing a machine returns attached connection value once and leaves no dangling endpoints.
- [x] Dismantle only when the complete bag transaction fits: body value, connection value, intact buffers and exactly one representation of job contents. Unfinished jobs return original ingredients; completed pending jobs return output, never both. Failure preserves all state; success releases footprint/deposit/edges once.
- [x] Test full-bag rejection, capacity actually freed by removing a carried item, partial jobs, blocked results, repeated commands and craft/recycle/dismantle loops. No solid value is minted; research payments remain consumed. Future ore/liquid recovery awaits that content.

- [x] Persist eight toolbar assignments and the active slot as bounded player state. Tools cannot enter the toolbar; assignments reference bag stock and remain at zero stock. Resolve the sequenced active placeable in the worker and consume one item only after valid placement, preserving existing saves and histories.
- [x] Measure factory reach to the nearest cell-footprint point and overlap against the actual player capsule/machine collision box. Share the 2 m range with the debug ring and local interactions; verify corners, cell margins, clear/tangent capsules and true collision, with preview/execution agreement.

## Step 3 Implement renewable-first power

- [x] Build deterministic connected components from saved explicit power edges. Count each generator once, including cyclic/multiple-edge networks. Disconnected components have separate supplies; no implicit global/radius power.
- [x] Derive daylight and fluctuating wind from simulation time/state. Solar produces only during daylight; wind keeps a defined floor outside Dunkelflaute events.
- [x] This slice has no Dunkelflaute events. Persist deterministic wind/cycle state; hidden/closed sessions advance no time or generation. Milestone 8 owns event exceptions and expanded weather.
- [x] Provide a complete solar/wind bootstrap without requiring coal technology or fuel; define sufficient starting generation and demand behavior.
- [x] Prepare runnable demand after commands and ingredient/capacity checks. For each network with positive demand use `fraction = min(1, available / requested)` and allocate each consumer its request times that fraction. Bound deterministic rounding by actual supply.
- [x] Scale work by allocated power and fixed delta; cap useful work/completion and account for actual energy use. Curtail unused allocation; no storage, catch-up, negative energy or double use. Field Research and the personal MiniFab request no grid power.
- [x] Preserve work through night, disconnection and shortage; resume on reconnection/resupply. Idle/blocked consumers cannot slow runnable machines. Show available/requested/used/curtailed power and the shared slowdown.
- [x] Test zero demand/supply, overload/disconnection, cyclic edges, fractional allocation and saved day/night continuation. Batteries, coal/fuel and event weather stay in Milestone 8.

## Step 4 Implement recycling, fabrication, extraction and lab work

- [x] The recycler produces bounded random plates/wire with scrap remainder, not a player-selected deterministic recipe. Persist its shuffled sequence/cursor as well as PRNG state; enforce the published maximum material-availability window.
- [x] Use a simulation-owned seeded random stream. Preserve pending results and random state across blocking and saves; no output rerolls.
- [x] General fabricators execute a selected unlocked recipe of their supported arity and reserve ingredients once.
- [x] Advance jobs using allocated power; preserve partial work and finished-but-blocked output until a full commit is possible.
- [x] Commit the whole outcome, including returned scrap, into its bounded pending-result buffer on completion and credit newly manufactured output once at that first buffer commit. Retain a saved history marker while main output is full; later buffer transfers/recovery add no history. Returned scrap is residual input and adds no production/extraction history.
- [x] Extract into the machine's output buffer. Coordinate claims/reservations with manual salvage so the same deposit quantity cannot be removed twice. Commit finite deposit deduction, output and extraction history atomically; blockage/depletion cannot invent or lose material.
- [x] Reject recipe changes during active/pending jobs or require explicit validated original-input cancellation before selecting another recipe. Never reinterpret old work or refund inputs while retaining their completed output.
- [x] Integrate real powered labs and Field Research in one call to the existing research coordinator per tick. Preserve stable lab order, source-local complete bundles, shared partial work, boundary payment, queue retention and next-tick head advancement. Do not add generic upfront job reservations to research.
- [x] Supply Medium-fabricated kits manually to at least two labs. More supplied/powered labs improve useful throughput on the same technology without duplicate payment/overshoot; power scales work rates. Missing stock cannot be drawn from another lab/bag; field enable affects only Field Research.
- [x] Preserve opening stock priority (manual/current handcraft → requested MiniFab → Field Research) while defining factory preparation/power/work phases. All MiniFab upgrades remain later work.
- [x] Make current-tick output available to transport on the next transport phase.

## Step 5 Render, inspect and verify continuation

- [x] Provide Angular construction/rotation, wiring, inspection, recipe/enable and buffer-transfer UI with separate HTML templates, keyboard/controller paths, focus restoration and text status/rejection cues. Verify WCAG AA/AXE and desktop/mobile capacity/power/research feedback.
- [x] Render completed world state without animation-driven production/research. Bind models, footprints/terminals and selection in Babylon; Editor scripts remain presentation bindings. Follow [art guidance](../art/README.md) and retain editable source/provenance under root `art/`.
- [x] Audit the authored 10 × 10, 2 m-cell fixture for all equipment, two labs, wire reach and player/extractor access. Make any necessary layout changes in the same Editor project/marker compiler; no free pre-placed operational machines or renderer-owned logical factories.
- [x] Extend validated versioned snapshots for all factory/job/buffer/history/deposit/connection state, pending random outcomes, PRNG/shuffle and cycle/wind state. Deliberately bump incompatible versions. Narrowly convert/default valid known `research-1` and previously supported `opening-1` saves on detached data; retain existing rollback and avoid save-format optimization.
- [x] Test rejected placement/transfers, arity exclusions, partial power, blocked output, recovery and resource conservation.
- [x] Save during simultaneous recycler/fabricator/extractor/lab work, a blocked random batch, retained queue ledgers and night-time shortage. With identical subsequent commands, restored stock, deposits, random sequence, work/power, research and native collision match the original branch.
- [x] Run built empty-handed gameplay through crafted solar/wind, wired recycler, both fabrication tiers, extractor, manually supplied kits/two labs and shared-queue completion of Sorting and conveyors without operating transport. Verify Save/page reload/Continue plus existing opening/save/worker acceptance, production build, strict checks, docs/assets and authoring recovery.
- [x] Measure active/idle factory and bounded publication/inspection costs manually against the existing baseline. Keep benchmarks outside CI, correctness/browser checks in normal CI, and record workload/hardware/limits in new evidence rather than rewriting historical reports.

- [x] Replace coordinate entry with Inventory & Crafting → Equipable, split into Tools and Placeables. Keep tools equipped separately; provide accessible slot assignment/clearing without moving stock or disrupting handcrafting. Retain Factory inspection, transfers, disconnection and existing power statistics; create new edges through two-click connector toolbar placement. Live graphs remain future work.
- [x] Wire 1–8/controller left-right selection, B/Select build mode, R/right-shoulder machine rotation and pointer/south-button placement to the active toolbar slot in production. Preview the actual one-cell machine silhouette or two-click power wire, clear build mode/draft anchors on UI interruption and avoid simultaneous world selection/pickup while placing. Reserve toolbar help height across selection/build changes.
- [x] Preserve valid pre-toolbar factory-1/native saves with detached empty defaults and reject malformed/unknown/tool toolbar entries. Add missing toolbar bindings to old profiles without resetting rebindings or explicit unbinding.
- [x] Verify the built inventory-assignment → numbered toolbar → B/R world construction route, depleted stock, factory/lab work and Save/reload/Continue, including desktop/mobile toolbar AXE, focus and overflow checks. Record the follow-up separately from the initial M6 report and reconcile the existing Fibery packages/catalogue terminology.

## Completion checks

- [x] All seven researched Placeable machine kinds and crafted power connections have paid craft/place/recover routes; solar/wind power the recycler, Basic/Medium machines, extractor and at least two supplied labs without coal or batteries.
- [x] Recycler plates/wire have bounded availability, scrap remainder and exact per-outcome solid conservation; Basic/Medium retain distinct arity/recipe roles.
- [x] Lab scaling, manual transfers and extraction behave through authoritative saved state.
- [x] Full dismantling recovery preserves material value without duplication.
- [x] Wired networks proportionally slow runnable machines without energy duplication; power, blocked output and progress are understandable and recoverable.
- [x] The placed factory works with manual supply before transport is added.

## Notes and implementation issues

| Date | Observation or decision | Follow-up and status |
| --- | --- | --- |
| 4 October 2026 | Not started; current source inspected. | Earlier coal-first deterministic-recipe checklist superseded by the 27 October direction. |
| 24 October 2026 | ECS selected as factory architecture; Miniplex leads evaluation. | Integrate at session level; no ECS package or factory implementation added by the core-object refactor. |
| 27 October 2026 | Renewable-first power, mixed recycler output, restricted fabrication tiers, labs and full scrap recovery agreed. | All implementation remains pending; sorting follows in Milestone 7 and expanded weather/restoration in Milestone 8. |
| 8 November 2026 | M5 implemented; user selected plates/wire, proportional power sharing, the eight equipment types and bounded randomness with scrap remainder. | Updated delivery/continuation steps and existing Fibery work packages. All factory implementation remains pending; numerical catalogue design comes first. |
| 8 November 2026, implementation | Full milestone authorized, implemented and locally verified. | All 44 step criteria and six completion checks pass; 151 Node/371 Chromium/90 tooling tests, coverage, full empty-handed industrial Save/reload/Continue, AXE, authoring recovery and manual factory profiling are recorded in the report. Existing Fibery packages are reconciled to the delivered scope; balance stays provisional. |
| 8 November 2026, toolbar feedback | Equipable splits into Tools and Placeables; factory construction moves to saved toolbar/B controls. | Six added criteria pass, bringing implementation criteria to 50. Reach/debug drawing now agree at 2 m to the nearest footprint; overlap uses actual bodies. 154 Node/373 Chromium/90 tooling tests and earned toolbar/industry/save/reload/mobile AXE pass; see the [follow-up report](../reports/milestone-06/2026-11-08/toolbar/README.md). Factory power statistics remain; live graphs are later work. |

## References and diagrams

- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Fixed step loop diagram](README.md#fixed-step-loop-diagram)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Recycler and factory fabrication](../design/player-progression.md#recycler-and-factory-fabrication)
- [Existing first-factory research/catalogue rules](../design/research-catalogue.md)
