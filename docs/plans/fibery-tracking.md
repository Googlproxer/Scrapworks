# Scrapworks project tracking in Fibery

Configured 28 October 2026 in the existing **Project Tracking** space. The sample project, seven sample tasks and Example dashboard were removed after a local backup; the useful table, hierarchy and board views were repurposed.

## Working views

| View | Use |
| --- | --- |
| [Projects](https://scrapworks.fibery.io/Project_Tracking/52) | Open the Scrapworks project for its summary, roadmap, catalogue links and related work |
| [Current work](https://scrapworks.fibery.io/Project_Tracking/54) | ECS selection/foundation is the first Open Milestone 3 package; all five opening gameplay-design tasks remain Done |
| [Milestones](https://scrapworks.fibery.io/Project_Tracking/53) | The ten canonical milestone outcomes, status, prerequisites and live task counts |
| [Milestones and tasks](https://scrapworks.fibery.io/Project_Tracking/9) | Expand the milestone/task hierarchy |
| [Milestone 3 opening](https://scrapworks.fibery.io/Project_Tracking/55) | Opening design, completed movement/presentation groundwork and pending gameplay |
| [Task board](https://scrapworks.fibery.io/Project_Tracking/15) | Workflow columns with milestone swimlanes |
| [All tasks](https://scrapworks.fibery.io/Project_Tracking/7) | Full editable task catalogue |

The initial import has **one project, ten milestones and 77 tasks: 21 Done and 56 Open**. These are work packages, not one record per checklist bullet. Partly completed source steps were split into completed groundwork and remaining work. Every task has its detailed checklist in **Acceptance Criteria**, scope notes, work type, priority and repository provenance. Dates, estimates and assignees were left unset except the explicitly completed Fibery setup date.

## Status and scope

Milestones 1 and 2 are complete for project integration and the migration's simulation/session foundation. The [28 October full CI run](../reports/ci/2026-10-28/README.md) verifies clean setup, tests, build and authoring recovery; the user confirmed the reviewed project changes were committed. Milestone 3 retains movement, collision, picking, deposit-state and UI/input credit; salvage mutation, field research, crafting jobs, inventory interaction and the usable MiniFab remain open. The opening tree and safe UI-bound handcrafting are now agreed. Inventory/salvage/tools design is complete, including a configurable starter-area total of 250,000 scrap; placement and tuning are implementation/authoring work. Field Research behavior design is complete: background work, direct gradual bag draws, synchronized one-of-each remaining-input cycles, whole-cycle shortage waiting, no cancellation/refunds and retained progress on pause/switch. MiniFab queue/buffer/cancellation and opening recovery design are complete: one-operation buffers, per-request intake, direct precursors, safe residue restrictions and scrap/source-ore solid recovery with liquid loss. Winding/charge behavior is now agreed and Done: five turn-equivalents fill 60 active seconds at 2x, work-only drain, proportional reversible handle movement, one-turn gearing cap and unlimited +50% battery levels at doubling costs. All five opening design tasks are complete; the five pending Milestone 3 gameplay work packages remain Open. An additional Open ECS foundation package now precedes them, making six unfinished Milestone 3 work packages and 78 project tasks (the 77-task initial import remains historical). Enabled research is the consume-only handcraft-capacity exception; other additions/transfers remain deferred. Cancelling handcrafting on UI exit preserves completed output and refunds unfinished original inputs; MiniFab closure does not stop background work. Numeric balance remains provisional. The final readiness review settles requested MiniFab before Field Research after manual actions, and blocks disassembly intact unless its full return fits. No opening gameplay-design blocker remains; ECS library selection and a measured foundation are the first implementation gate, moved forward from Milestone 6; the Milestone 3 scope/readiness section separates baseline delivery from later upgrades.

Milestones 4–10 remain planned. Milestone 10 retains its completed migration presentation, production, small-fixture profiling and documentation tasks; those do not complete the factory prototype. Unvalidated save/import scaffolding and controls-settings persistence do not establish gameplay saving.

Forward-looking unchecked requirements in otherwise completed foundation steps are tracked with their owning later task. For example, snapshot capture/world replacement belongs to Milestone 4 and atomic resource spending belongs to the researched opening. The owning task's Acceptance Criteria retains the originating source/heading and requirement. Source Markdown checkboxes were not changed by this import.

## Relations and editing

Projects own milestones and tasks; each roadmap task also belongs to its milestone. The Fibery authoring/setup task is project-level. There are ten milestone prerequisite links and 22 task dependency links. The roadmap links describe ordering; they do not invent dates or imply that integration housekeeping erased completed simulation work.

**Unfinished Dependencies** counts incomplete prerequisite tasks. **Completed Tasks** and **Open Tasks** are live milestone formulas. These count work packages, not weighted percentages, and do not automatically change milestone status. **Current Focus** selects the immediate work view.

Relevant design/implementation tasks have 64 live links to the [catalogue](../design/balance/README.md) through Technologies, Recipes and Items. Catalogue records expose the inverse **Delivery Tasks** relation. These links connect design content to implementation work without treating a draft technology as completed gameplay.

Update workflow state as work is demonstrated, and keep acceptance criteria and dependency links current. A checked text checklist and the task workflow are separate fields: update the workflow deliberately when the scoped task is complete. Use the milestone description's completion criteria before closing a milestone.

## Provenance and reconciliation

Sources are the [roadmap](README.md), its ten milestone files, [player progression](../design/player-progression.md), [draft opening catalogue](../design/opening-catalogue.md), and dated migration evidence. Current source inspection confirmed the placement-only simulation command and empty new-world inventory/equipment/research; no gameplay implementation was added. Completion credit comes from source checklists and their dated evidence, not a new full test run.

[fibery-tracking-import.json](fibery-tracking-import.json) records source IDs, Fibery UUIDs/URLs, workflow counts, reassigned forward requirements, relations and verification results. It is an import receipt, not a live export or automatic synchronization. Preserve these identities when reconciling later changes; do not blindly recreate imported records.

Fibery is the working project tracker. Reconcile accepted design/implementation changes back into the repository plans and design documents. The sample-data backup is local under ignored `tmp/fibery/`; Fibery's Activity Log also provides recovery for the removed records/views. The separate Scrapworks catalogue and Meetings databases were preserved.

All 77 acceptance checklists, project/milestone ownership, workflow states, prerequisite links and catalogue links were read back and compared with the import data. Saved-view queries returned the expected one project, ten milestones, 77 tasks, six current-work rows and 15 Milestone 3 rows, with no additional pages at import. The completed Milestone 1 follow-up is now removed from Current Focus, leaving the five opening decisions at that checkpoint. The subsequent opening-tree/handcrafting agreement completes one of those, leaving four at that checkpoint. Inventory/salvage/tools subsequently completed, leaving three at that checkpoint. Field Research behavior is now agreed and complete, leaving two at that checkpoint. MiniFab queue/recovery is now complete, leaving winding/charge balance active at that checkpoint. Winding/charge design is now complete, closing all five opening design tasks without adding gameplay implementation.
