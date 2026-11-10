# Architecture modernization implementation record

Implemented 2 November 2026 under the approved seven-stage plan. The [completion report](../reports/architecture-modernization/2026-11-02/README.md) records each stage, validation, bundle evidence, dependency remediation and measurement limits. The [runtime architecture decision](../decisions/runtime-architecture.md) owns the current contracts and boundaries.

Baseline revision: `16951310aa51fcef6b9b40293a26b85b5ceab733`. The game route's statically reachable raw JavaScript is reduced from 13,349,796 to 4,090,975 bytes (69.4%), exceeding the 40% requirement. Committed budgets warn at 5% and fail at 10% above the completed result.

| Stage                                                                                     | Status                   |
| ----------------------------------------------------------------------------------------- | ------------------------ |
| Typed command/domain outcomes and reliable notification delivery                          | Implemented and verified |
| Production-focused simulation schemas, command batches and runtime capabilities           | Implemented and verified |
| Capability ports, renderer streams, focused Angular collaborators and read-only ownership | Implemented and verified |
| Native scene-owned presentation lifecycle; Toolkit removal                                | Implemented and verified |
| Placement/occlusion work reduction and validated atomic scene registrations               | Implemented and verified |
| Current-game benchmarks and watcher reconciliation                                        | Implemented and verified |
| Documentation, diagrams, architecture/bundle enforcement and final validation             | Implemented and verified |

Gameplay rules and balance were preserved by this modernization. Gameplay persistence, offline progression, new factories/content, additional workers, publishing and deployment were outside its scope. [Milestone 4](milestone-04-first-local-save.md) subsequently introduced gameplay repository, codec, capture and replacement boundaries.
