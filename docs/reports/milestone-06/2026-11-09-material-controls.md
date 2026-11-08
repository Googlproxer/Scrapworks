# Machine-specific material controls — 9 November 2026

Loading now shows only inputs accepted by the inspected machine's applied process. A shared content policy drives both the selector and authoritative worker validation. Bag stacks still aggregate into one choice per material with their combined quantity; accepted zero-stock choices retain their place. Fabricators without a configured recipe have no loading choices.

Collection controls show the applied process's input and output types, plus actual stored leftovers from earlier recipes. Other supported recipes no longer contribute visible buttons. Invisible, inaccessible reservations preserve the wrapped controls' height. Draft recipe choices survive ordinary inspection updates; material controls change only when the worker publishes the applied recipe.

The [catalogue](../../design/factory-catalogue.md) explains the recipe policy: researched Basic recipes use exactly one distinct input type, Medium recipes use exactly two. Four buffer slots store stacks independently of that process limit. A Medium machine can assemble a Basic Fabricator from plates and mechanical parts. Deterministic plate/wire recovery stays with personal processing, while factory refinement uses mixed recycling.

Validation:

- All 156 simulation/persistence tests pass. Added authoritative coverage rejects loads incompatible with the applied recipe without mutation, accepts the new inputs after configuration, and collects old input/output stock without crediting production again.
- All 377 Chromium tests pass. Six focused factory-panel cases cover grouped stacks, applied versus draft recipes, recipe clearing, stored leftovers, AXE accessibility, and wide/narrow cycle layout and focus stability. No unexpected console diagnostics.
- Strict test types, full source lint, production build, deterministic boundaries, worker/main separation, bundle limits, documentation links and whitespace checks pass. The build retains its existing Miniplex `eventery` CommonJS warning.

Changes remain in the local working tree. No new hosted CI or deployment was performed for this correction.

## Collect all output follow-up

Added a stable **Collect all output** control for machines with output storage. It remains disabled when empty and submits one guarded `factory-collect-output` command without using the material/quantity fields. The worker resolves all stored output at execution and preflights the complete bag addition before clearing any output. Insufficient capacity, reach or active handcraft rejects without moving stock. Inputs, pending work/results and production history remain intact. Repeated empty collection cannot duplicate items.

All 158 simulation/persistence and 378 Chromium tests pass after this addition, including seven focused factory-panel tests with AXE and wide/narrow layout checks. New regressions cover mixed items, duplicate output stacks, filling existing bag stacks, whole-collection capacity rejection, reach/handcraft rejection, empty repetition and quantity-independent UI requests. Strict types, full source lint, production build, deterministic/worker/bundle boundaries, documentation and whitespace checks also pass. Documentation and M06.2 Fibery scope notes are reconciled; changes remain local.
