# Scrapworks documentation

Updated 2 November 2026. Scrapworks is a browser-first 3D factory-restoration game. Angular owns UI; Babylon owns presentation; Editor markers own authored layout; the single plain-TypeScript simulation worker owns movement and the complete Milestone 3 opening. Factory progression and gameplay saves remain later work.

## Design and planning

- [Game Design Document](design/GDD.md): opening, progression, environmental choices and prototype scope.
- [Player progression](design/player-progression.md): agreed decisions, pacing, Mini Fabricator, research, recovery and open questions.
- [Opening catalogue](design/opening-catalogue.md): agreed crafting/research order and UI-bound safe handcrafting, with provisional costs/timings and a checked bootstrap budget.
- [Fibery catalogue and trees](design/balance/README.md): connected databases, entity-linked crafting/research whiteboards and import receipt.
- [Implementation roadmap](plans/README.md): ten milestones with verified groundwork and outstanding gameplay tasks.
- [Fibery project tracking](plans/fibery-tracking.md): working task board, milestone hierarchy and current design decisions.
- [Art Document](art/README.md): approved finish, identity, readability and 3D production guidance.
- [Source art](../art/README.md): editable Blender sources, references, exact prompts and provenance.

## Implementation and authoring

- [Technical Design Document](design/TDD.md): ownership, current implementation and planned systems.
- [Event-handling decision and audit](decisions/event-handling.md): RxJS event adapters, subscription ownership and native boundary exceptions.
- [Development debug drawing](plans/debug-drawing.md): object-owned wire shapes, Editor attachments, live player boundaries, category controls and production exclusion.
- [Simulation worker investigation](plans/simulation-worker-investigation.md) and [lean results](reports/simulation-worker/2026-10-30/README.md): Miniplex and bitECS qualify with compact transferred views and bounded detail subscriptions; retain Miniplex. The [rich transport study](reports/simulation-worker/2026-10-29/README.md) remains historical. The single-worker production path is implemented; additional worker partitioning remains deferred.
- [Production ECS/worker implementation plan](plans/ecs-worker-implementation.md): Step 0 is implemented and qualified, including production data/contracts, completed-tick presentation hooks, authored-world Retry and integrated acceptance checks. See the [implementation report](reports/ecs-worker-implementation/2026-10-30/README.md).
- [3D migration](plans/3d-migration.md) and [acceptance checklist](plans/3d-implementation-checklist.md): completed migration scope and evidence.
- [Runtime walkthrough](plans/3d-phase-2-walkthrough.md): lifecycle, input, native presentation behaviors and session ownership.
- [Editor/MCP setup](plans/babylon-editor-setup.md): authoring, export and desktop tools.
- [World markers](../tools/world/README.md): authored metadata, units and compilation.
- [Export tools and policy](../tools/scenes/README.md): source boundaries, manifest-driven packaging and recovery.
- [Tool catalogue](../tools/README.md): direct commands for occasional audits, Editor checks and opt-in ECS/worker investigations.
- [Diagrams](diagrams/README.md): authoritative Mermaid sources and matching SVG/PNG exports.
- [Cleanup record](plans/3d-cleanup.md): current retirement policy and recovery sources.

## Verified implementation

Babylon is the sole renderer at `/`; `/3d` redirects to it. Angular owns menus, Controls, loading/errors and Retry. The Game scene supplies a 10 by 10 fixture, world markers, camera and neutral character binding. The plain simulation owns fixed-step movement, collision and development-fixture placement; new worlds have empty inventory, equipment and research.

Saved markers compile into plain definitions and publish atomically with scene exports. `yarn dev` watches saved inputs and retains the last working export on failure. The host session supplies the sole 20 Hz clock to one private Miniplex worker. Its [foundation qualification](reports/ecs-worker-implementation/2026-10-30/README.md) remains dated evidence; the [Milestone 3 report](reports/milestone-03/2026-11-02/README.md) records the new inventory/salvage/research/handcraft/MiniFab loop, accessible UI and empty-handed opening route. Milestone 6 extends the same runtime with factories.

Development debug drawings attach to scene objects through TypeScript or Editor scripts. Master/category controls, player placement/collision circles and authored player axes run on the main thread using completed presentation data. Production selects a no-op backend; debug geometry and renderer modules are excluded from its dependency graph.

The [23 October migration evidence](reports/migration/2026-10-23/README.md) and later opening evidence have separate scopes. Controls preferences and the test-data save dialog do not implement gameplay saves. Milestone 3 includes plain detachable work/state and validation; Milestone 4 owns playable save/load. Machines, transport and restoration remain unimplemented.

Dated benchmark reports retain their original source links. [Source recovery](reports/source-recovery.json) records the exact Git revision, content hash and remote URL for intentionally retired sources. Documentation checks verify those source bytes from Git; shallow checkouts must fetch that recorded history. Historical reports and measurements remain unchanged.
