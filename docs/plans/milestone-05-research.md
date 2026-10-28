# Milestone 5 Research

Updated 27 October 2026. Status: not started. Prerequisite: [Milestone 4](milestone-04-first-local-save.md); the first timed field-research and recipe-unlock slice now belongs in [Milestone 3](milestone-03-character-and-manual-opening.md).

Expand the research-led opening into a reachable industrial tree with dedicated research craftables, faster laboratories and scalable research work. The [progression specification](../design/player-progression.md) owns the decisions; this checklist does not establish implementation.

[High-level plan](README.md) · [Next milestone](milestone-06-first-working-machines.md)

## Current implementation

There is no technology catalog, research contribution/work system, material-payment command or research interface. Migration left empty research and production data fields; it did not implement progression. Milestone 3's newly planned bootstrap research is also unimplemented. Lab rules can be developed with plain fixtures here; physical power, fabrication and laboratory integration arrive in Milestone 6.

## Step 1 Define the technology catalog and reachability

- [ ] Build on the Milestone 3 bootstrap rather than introducing research for the first time here.
- [ ] Define stable technology IDs, prerequisites, extraction/production eligibility, contribution costs, work requirements and unlocked recipes/equipment.
- [ ] Gate every crafting capability, including starting material recipes. Gathering and field research remain starting abilities.
- [ ] Preserve the scrap-only MiniFab research/assembly path. Its power-free baseline and optional local winding do not depend on electricity or refined components.
- [ ] Retain scrap, plates, wire, mechanical parts and electrical parts as useful inputs to later branches.
- [ ] Start research costs with extracted resources, then basic crafted items; introduce dedicated manufactured research craftables later in the tree.
- [ ] Include renewable power, recycling, extraction, sorting/logistics, fabrication, laboratories, storage, water treatment and greenhouse research groups. Keep coal and pollution mitigation optional branches.
- [ ] Audit an acyclic, coal-free route from empty-handed gathering through every required material, machine and unlock. First labs and kit-making equipment cannot require research kits to unlock themselves.
- [ ] Specify Basic/Medium/Advanced fabrication recipe eligibility as exactly one, exactly two, and three/four distinct ingredient types. Scope which tiers the prototype will actually deliver.

## Step 2 Specify contributions and timed progress

- [ ] Preserve completed crafting/production totals and separate newly extracted-resource history. Transfers, output collection and refunds never increment either history.
- [ ] Keep historical eligibility, current stock, contributed/reserved materials, research work and unlock completion separate.
- [ ] Settle contribution granularity, reservation/payment timing, cancellation and handling of already-funded work before implementing the shared rule.
- [ ] Field research takes ingredients from player inventory and advances with simulation time; it is slower than a lab.
- [ ] Define a shared progress model for field work and multiple laboratories, with scalable lab throughput and no duplicated payment or overshoot on the final work unit.
- [ ] Decide field-work concurrency and whether field research remains available for all later technologies or has explicit capability limits.
- [ ] Define lab input buffers and dedicated research-craftable consumption without inventing global remote inventory access.
- [ ] Research payment preserves lifetime histories; crafting the unlocked equipment remains a separate material cost.

## Step 3 Implement authoritative work and unlocks

- [ ] Accept technology/contribution/work-control commands through the session. Revalidate IDs, prerequisites, eligibility, source stock and remaining research demand at execution.
- [ ] Commit each accepted reservation/contribution atomically; duplicate requests cannot spend the same stock or fund completed research again.
- [ ] Advance field/lab work only on simulation steps. Pause/suspension cannot produce hidden-time progress.
- [ ] Grant each unlock once when its funded work completes; do not use the former immediate pay-and-unlock transaction.
- [ ] Enforce recipe unlocks in craft-start, Mini Fabricator precursor planning, factory recipe selection and eventual construction.
- [ ] Specify research for the later inventory-driven Mini Fabricator upgrade and its configurable min/max input/output controls; explicitly schedule its implementation slice before claiming that capability.
- [ ] Gate solar/wind/coal/grid MiniFab upgrades behind their related general technology and separate MiniFab-specific research, then require crafting the physical upgrade before applying its effect. Plan battery upgrades similarly; exact prerequisite placement remains a content decision.

## Step 4 Present research clearly

- [ ] Display prerequisite technologies, historical extraction/production, available stock, contributions, remaining work and unlocks.
- [ ] Explain when eligibility is met but payment stock is missing, and when paid research still needs time.
- [ ] Show field and lab work rates and explain the benefit of additional labs.
- [ ] Show equipment crafting costs separately and explain recipe/machine arity restrictions.
- [ ] Make locked/available/in-progress/completed states keyboard accessible and understandable without color alone.

## Step 5 Extend snapshots and verify progression

- [ ] Capture and validate research contributions/reservations, remaining work, active targets, histories and unlocks; extend for lab instances in Milestone 6.
- [ ] Test duplicate contributions, simultaneous workers, insufficient stock, unmet prerequisites, unknown IDs and already-completed technologies with no partial mutation.
- [ ] Test saving/loading midway through funded work, with the same continued stock, history, progress and unlock result.
- [ ] Verify more supplied labs increase useful throughput without creating free research.
- [ ] Play the opening into renewable-powered industry without coal or pre-unlocked crafting; keep combined research/construction costs within the opening pacing targets.

## Completion checks

- [ ] Bootstrap field research expands into a reachable industrial tree.
- [ ] Timed research pays once, preserves history and grants each unlock once.
- [ ] Dedicated research craftables and scalable lab rules are defined and verified; physical integration is tracked in Milestone 6.
- [ ] Locked recipes cannot be executed through direct commands, precursor planning or factory selection.
- [ ] Save/load preserves research progress and continued behavior.
- [ ] Optional pollution cannot block continued research or access to green technologies.

## Notes and implementation issues

| Date | Observation or decision | Follow-up and status |
| --- | --- | --- |
| 4 October 2026 | Not started; current source inspected. | Earlier checklist described immediate material-paid research without science packs. |
| 27 October 2026 | Research every crafting capability; field work is slower than scalable labs; later inputs include dedicated research craftables. | Supersedes immediate unlocks/free starting recipes/no-science-pack requirements. Bootstrap moved to Milestone 3; all new tasks remain unchecked. |

## References and diagrams

- [Research transaction diagram](README.md#research-transaction-diagram)
- [Research progression](../design/player-progression.md#research-progression)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Save flow diagram](README.md#save-flow-diagram)
