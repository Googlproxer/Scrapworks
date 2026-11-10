# Milestone 5 Research

Implemented 8 November 2026 following the user's subsequent authorization of the updated plan and shared-task queue correction. [Implementation and verification evidence](../reports/milestone-05/2026-11-08/README.md) records local acceptance. Prerequisites [Milestone 4](milestone-04-first-local-save.md) and [Milestone 3](milestone-03-character-and-manual-opening.md) retain their completed credit. Physical factory/lab integration remains Milestone 6; these changes have not been published or tested by a new hosted CI run.

Expand the existing research-led opening into the first-factory technology tree, add the Basic research kit and an editable shared research queue, preserve opening saves, and prove shared laboratory rules with plain simulation fixtures. Physical construction, power, factory execution and functioning placed laboratories belong to [Milestone 6](milestone-06-first-working-machines.md). The [progression specification](../design/player-progression.md) owns the decisions; this checklist does not establish implementation.

[High-level plan](README.md) · [Next milestone](milestone-06-first-working-machines.md)

## Groundwork audited before implementation

The 8 November source review found the following implemented foundation. Preserve its credit and behavior rather than rebuilding it in this milestone.

| Boundary | Existing implementation and evidence | Milestone 5 extension |
| --- | --- | --- |
| Content and authority | [Opening content](../../src/content/opening.ts) defines five technologies and six recipes. One Miniplex worker owns fixed-step gameplay. | Extend the catalogue and shared rules in the same authority. |
| Research and crafting | [OpeningSystem](../../src/simulation/opening.ts) implements timed background Field Research, synchronized material cycles, retained progress, histories and handcraft/MiniFab recipe gating. | Broader paid technologies, research-kit crafting and shared lab-work rules. |
| Presentation          | [Research panel](../../src/app/features/game/field-kit/research-panel/research-panel.component.ts) shows enable/pause, material waits, contributions and work.                                          | Explicit prerequisite/history/stock/unlock information and a readable larger tree. |
| Durable continuation | [Milestone 4 evidence](../reports/milestone-04/2026-11-08/README.md) covers manual saves of research, handcraft, MiniFab and native physics. Current save validation requires an exact content version. | Research-state extensions and a narrow path for compatible Milestone 4 saves. |

Review baseline: clean `master` at `16e4aa7`, [passing hosted CI](https://github.com/Googlproxer/Scrapworks/actions/runs/42445867483), fresh strict game/reference type checks, all 121 simulation/session/persistence tests and documentation validation. This is existing-system evidence, not Milestone 5 implementation credit. At that review Fibery held six Open packages and a Planned milestone; the subsequent implementation is recorded below.

## Delivered implementation

The same worker now owns 14 paid technologies/seven recipes, a single editable research queue, retained unqueued ledgers and source-local research rules. Basic research kits support safe handcrafting/MiniFab and fund the sorting/conveyor research stage. Blueprint costs remain separate from research; physical construction is deferred. The [catalogue specification](../design/research-catalogue.md) records provisional payments, work, construction inputs, stable identities, exact fabrication eligibility and deterministic lab fixture coordination. Current saves retain the queue and every ledger; the known Milestone 4 content revision receives a validated detached upgrade without lost work or repayment. Accessible queue/history/stock/unlock presentation and production browser acceptance are delivered. The checklist below records this scope, with real lab instances/power and transport still owned by later milestones.

## Agreed scope and decisions — 8 November 2026

1. **Delivery boundary:** Milestone 5 delivers expanded research/catalogue/UI/save coverage and tested laboratory rules. Milestone 6 delivers placed machines, electricity, supplied lab buffers and working industrial integration. The coal-free industrial playthrough is a Milestone 6 acceptance check.
2. **Technology scope:** Finalize electrical engineering, separate solar/wind branches, mixed recycling, Basic/Medium fabrication, extraction and laboratory research. Define the broader sorting/logistics, storage, water treatment and greenhouse route without implementing every later branch. Advanced fabrication, MiniFab upgrades and optional coal/pollution mitigation stay with their later implementation slices. Basic accepts exactly one distinct ingredient type, Medium exactly two, and future Advanced three or four; higher tiers do not replace lower tiers.
3. **First craftable:** Basic research kit uses mechanical and electrical parts. Its safe assembly is handcraftable and MiniFab-compatible after research, with Medium fabrication automation in Milestone 6. Quantities, durations, stack limits and costs are provisional balance to draft during catalogue work. The first Medium Fabricator, lab, laboratory research and kit-recipe unlock use existing components, never their own research kits.
4. **Field compatibility:** Field Research can complete every prototype technology when the required items are supplied, including research-kit costs. Labs provide speed and scalable throughput; no prototype technology is lab-only. Existing background concurrency and stock priorities remain settled.
5. **One active task and shared queue:** At most one technology is active across Field Research and all labs. Every enabled source contributes to that same technology against shared remaining demand/work, without duplicate payment or final-unit overshoot. The user can add, remove and reorder queue entries, including the current task, without losing any technology's material investment or completed/partial work. Each lab uses only its own supplied buffer; field work uses uncommitted bag stock. Disabling Field Research stops bag withdrawals while supplied labs continue on the same task. This correction supersedes the initial independent field/lab target recommendation.
6. **Save compatibility:** Preserve compatible Milestone 4 saves where practical through a small, explicit compatibility path. Preserve stable IDs, contributions, work, histories, jobs and run identity, and default only newly introduced state. General migration tooling remains Milestone 9. Keep the existing object save representation under the [deferred optimization decision](milestone-09-save-resilience.md#save-performance-decision--8-november-2026).

These accepted design decisions were first recorded without implementation credit. The user's subsequent implementation authorization delivers the scope and verification above; it does not implement physical factory/lab systems.

## Shared research queue

The ordered queue has one active head, or no active research when empty. Field Research and every lab follow that head; there are no separate field/lab technology selectors. Completion grants its unlock once, removes the completed entry and advances to the next head. Only the current technology can receive research work or consume research inputs.

The player can add technologies, reorder any entry and remove any entry, including the active one. Moving/removing the head changes the active technology at an authoritative simulation boundary. Keep per-technology contributions, completed work and partial-cycle/funded work separate from queue membership: removal is not a reset, refund or loss of progress. Re-adding a removed technology resumes its retained state. Switching cannot apply old work or committed inputs to a new technology; unchanged local lab-buffer stock remains available for compatible future work.

Use explicit queue order. Revalidate prerequisites, historical eligibility and source stock at activation and consumption; a blocked head waits with a reason rather than silently skipping ahead or researching another technology. Later entries may describe future prerequisites, but queueing never bypasses them. Unknown IDs, duplicate entries and already-completed technologies must not create a second task or spend materials. Removing a prerequisite entry leaves dependent entries blocked until their actual prerequisites are met.

Save queue order and all retained technology ledgers, including removed tasks. Persist enough state to resume the same head/waits without double payment, lost partial work or unpaid catch-up. The narrow Milestone 4 compatibility path maps a valid unfinished legacy Field Research target to the initial queue head and preserves every other ledger. A legacy save with no active target starts with an empty queue.

## Design package Research kit and laboratory coordination

The concrete catalogue and coordination specification is delivered in the [research catalogue](../design/research-catalogue.md). The existing Fibery package is reconciled with the five implementation/validation packages after local acceptance. Balance remains provisional rather than a renewed design approval gate.

- [x] Draft Basic research kit quantities, work time, stack/material value and stable authoring/runtime IDs; keep mechanical/electrical ingredients and hand/MiniFab/Medium eligibility explicit.
- [x] Draft scoped technology payments, eligibility and work times, equipment construction costs and kit-cost staging after the kit unlock; unspecified costs must remain unavailable rather than free.
- [x] Specify one shared queue/head for Field Research and all labs, per-lab buffer capacities/rates, deterministic source ordering, remaining-demand allocation and retention of all technology progress through queue edits, waits and source removal.
- [x] Specify that a source must supply its complete next still-required material bundle; do not assemble a bundle from remote bags/lab buffers. Preserve atomic consumption and prevent unpaid catch-up or stranded duplicate reservations.
- [x] Audit bootstrap reachability using existing components and record which checks run as Milestone 5 fixtures versus Milestone 6 physical integration.

## Step 1 Define the technology catalog and reachability

- [x] Extend the implemented five-technology/six-recipe bootstrap, preserving existing IDs, recipe gates and the component-led MiniFab path. Gathering and Field Research remain starting abilities; baseline MiniFab and winding remain independent of factory electricity.
- [x] Define stable technology IDs, prerequisites, extraction/production eligibility, contribution costs, work requirements and unlocked recipes/equipment for the agreed first-factory slice.
- [x] Add the Basic research kit item/recipe definition after laboratory research, using mechanical/electrical parts and safe handcraft/MiniFab eligibility; record its future Medium Fabricator compatibility.
- [x] Retain scrap, plates, wire, mechanical parts and electrical parts as useful inputs to later branches.
- [x] Stage costs from extracted resources to crafted components and then kits. Draft quantities/times and construction costs as provisional balance; keep unpriced future records unavailable.
- [x] Define the wider sorting/logistics, storage, water treatment and greenhouse dependency route, with optional coal/mitigation and deferred Advanced fabrication/MiniFab upgrades visibly assigned to later slices.
- [x] Audit an acyclic, coal-free route from empty-handed gathering through every required material, machine and unlock. First labs and kit-making equipment cannot require research kits to unlock themselves.
- [x] Validate exact fabrication arity and catalogue references. Milestone 6 integrates Basic/Medium machinery; future Advanced supports only three/four ingredient types.

## Step 2 Specify contributions and timed progress

- [x] Extend the existing distinction between history, current stock, permanent consumed-material investment, partial work and unlocks. Transfers, refunds, collection and research payment do not add production/extraction history; equipment construction has a separate cost.
- [x] Generalize synchronized one-of-each still-required input cycles without losing pause/switch retention, whole-bundle waiting, paid-in-full exclusions or the no-cancellation/refund and no-unpaid-catch-up rules.
- [x] Keep Field Research capable of all prototype technologies, including kit-funded work; retain background uncommitted-bag consumption, manual/current-handcraft then requested-MiniFab then Field Research priority, and no withdrawals while disabled.
- [x] Define exactly one active technology from the shared queue head for Field Research and every lab, with per-lab supplied buffers and faster configurable rates. Physical buffer transfer, power and lab instances remain Milestone 6.
- [x] Specify add/remove/reorder, automatic completion advancement and blocked-head behavior, including moving/removing the current task. Queue membership never owns or erases per-technology contributions, completed/partial work or committed-input attribution.
- [x] Specify shared remaining-demand/work coordination for all enabled sources on the same active technology. Multiple supplied labs must increase useful throughput without double payment, overspend or final-work overshoot; no second technology advances concurrently.
- [x] Specify deterministic source allocation and partial-work/reservation handling without cross-buffer material pooling, hidden inventory access or completion funded by unavailable inputs.

## Step 3 Implement authoritative work and unlocks

- [x] Extend existing session commands and fixed-step research for the scoped catalogue and shared queue. Apply add/remove/reorder/current-task changes atomically; revalidate IDs, duplicate/completed entries, prerequisites, eligibility, source stock and remaining demand without resetting progress.
- [x] Extract/reuse plain research contribution/work rules for both Field Research and laboratory fixtures inside the established simulation authority. Renderer callbacks, wall-clock time and a second simulation world cannot advance research.
- [x] Support the Basic research kit in safe handcrafting and requested MiniFab/precursor execution after its recipe unlock, with production history and material conservation.
- [x] Preserve recipe gates in direct craft commands and MiniFab precursor planning. Validate future factory eligibility through plain fixtures; factory recipe selection and construction enforcement integrate in Milestone 6.
- [x] Prove that every source follows one shared head through queue edits, blocked heads, material waits, completion advancement and simultaneous final contributions. Removed/re-added technologies resume their exact retained progress; add no placed lab, power or global remote-stock gameplay.
- [x] Retain later MiniFab upgrade contracts in the roadmap: related general technology plus separate MiniFab research plus crafted/applied module; autonomous min/max input/output controls need their own scheduled slice. Implement none of these upgrades here.

## Step 4 Present research clearly

- [x] Display prerequisite technologies, historical extraction/production, available stock, contributions, remaining work and unlocks.
- [x] Explain when eligibility is met but payment stock is missing, and when paid research still needs time.
- [x] Present one active technology with its ordered queue, add/remove controls and keyboard-accessible reordering. Permit removal/reordering of the current task, expose retained progress for removed tasks when browsing/re-adding, and explain that removal does not refund or erase investment/work.
- [x] Extend enable/pause and wait feedback to the shared task, larger tree and kits. Field enable controls bag contributions only; supplied labs follow the same head. Show irreversible investment and bag consumption; closing the panel does not stop work.
- [x] Explain Field Research's full prototype compatibility and future faster/scalable labs on the same task. Keep physical lab status/rates descriptive until integration in Milestone 6; show no operational labs that do not exist.
- [x] Show equipment crafting costs separately and explain recipe/machine arity restrictions.
- [x] Make locked/available/in-progress/completed states keyboard accessible and understandable without color alone.

## Step 5 Extend snapshots and verify progression

- [x] Extend existing capture/validation for the broader catalogue, kit stock/history, shared queue order/head and every technology ledger, including tasks removed from the queue. Milestone 6 adds actual lab instances, buffers, power and source work; UI status is derived.
- [x] Add a small explicit compatibility path for valid Milestone 4 saves where practical. Retain world/run identity, existing IDs, contributions/partial work, histories, committed handcraft inputs, MiniFab state and physics without repaying or advancing work; default only new state. Reject malformed/unsupported saves while preserving the active world and committed slot.
- [x] Keep the existing object save representation. General migrations, autosave/revisions and transfer stay in Milestone 9; save-format optimization remains deferred.
- [x] Test duplicate contributions, simultaneous workers, insufficient stock, unmet prerequisites, unknown IDs and already-completed technologies with no partial mutation.
- [x] Test current and compatible Milestone 4 save/load midway through paid research and kit crafting, including queue edits, removed/re-added current tasks, blocked heads and partial cycles. Preserve continued stock/history/work/unlocks; map a valid unfinished legacy target to the initial head without losing other ledgers.
- [x] Verify with plain fixtures that all field/lab sources share exactly one active task and more supplied labs increase useful throughput without free research or cross-buffer consumption. Cover queue completion/edit races, empty queues, duplicate/completed/unknown entries, blocked dependencies and no old-target work credited to a new head.
- [x] Verify the playable research/kit route and audit the coal-free construction/material dependency path. Preserve existing opening pacing targets; do not treat them as a new first-factory deadline. The working renewable factory/lab playthrough belongs to Milestone 6.

## Completion checks

- [x] Existing Field Research expands through the agreed first-factory tree; the Basic research kit is researched and safely craftable, with provisional balance clearly recorded.
- [x] Every prototype technology remains Field Research-compatible when supplied; costs pay once, histories persist and unlocks occur once.
- [x] One active research task and an editable queue are presented and saved. Adding/removing/reordering tasks, including the current task, loses no contributions or completed/partial work, and re-adding resumes retained progress.
- [x] Plain fixtures prove all field/lab sources follow the same queue head, source-local buffers and useful multi-lab scaling without double payment, overshoot or concurrent different-technology work. Working placed labs remain Milestone 6.
- [x] Direct crafting and MiniFab precursor planning enforce unlocks; future factory arity/gates pass catalogue/fixture checks before Milestone 6 integration.
- [x] Current saves and supported Milestone 4 saves preserve continued research/crafting behavior through the narrow compatibility path.
- [x] The coal-free dependency route is reachable on paper and through applicable research fixtures; optional pollution cannot block green progression. Physical industrial acceptance remains Milestone 6.

## Notes and implementation issues

| Date | Observation or decision | Follow-up and status |
| --- | --- | --- |
| 4 October 2026 | Not started; current source inspected. | Earlier checklist described immediate material-paid research without science packs. |
| 27 October 2026 | Research every crafting capability; field work is slower than scalable labs; later inputs include dedicated research craftables. | Supersedes immediate unlocks/free starting recipes/no-science-pack requirements. Bootstrap moved to Milestone 3; all new tasks remain unchecked. |
| 8 November 2026 | Source/Fibery review confirms Milestones 1–4 complete and existing five-technology research/save behavior. User accepted all six recommendations above. | Update plans/tracker only; retain Milestone 5 Planned and all six packages Open. No implementation started. |
| 8 November 2026, clarification | User requires only one active technology shared by Field Research and labs, plus an editable queue whose current task can be removed/reordered without losing progress. | Supersedes independent field/lab targets; queue behavior, UI, snapshots and continuation acceptance now belong to Milestone 5. Implementation remains unstarted. |
| 8 November 2026, implementation | User authorized the complete updated Milestone 5 plan. | Delivered catalogue/kit/queue/UI/compatibility and lab fixtures with local regression/browser acceptance; see the implementation report. No physical factory/lab or transport execution added. |

## References and diagrams

- [Research transaction diagram](README.md#research-transaction-diagram)
- [Research progression](../design/player-progression.md#research-progression)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Save flow diagram](README.md#save-flow-diagram)
