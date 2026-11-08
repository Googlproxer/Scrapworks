# Machine inspection layout stability

Verified 9 November 2026 after the user reported extractor cycle text disappearing and moving the controls below it. The standing UI preference is recorded in [project guidance](../../../AGENTS.md) and the [technical design](../../design/TDD.md): reserve blank space for conditional content where practical and keep controls anchored during live updates.

Machine inspection now reserves the wrapped height of possible work/results, including every recycler outcome. Empty reservations are hidden from assistive technology. Buffer summaries aggregate repeated materials and reserve capacity for their possible text; collection controls remain present and disable when stock is insufficient. Status fields and fixed-width tabular power figures avoid wrapping changes during cycle transitions.

Real Chromium geometry regressions at 1,100 px and 350 px panel widths cover extractor/recycler idle, working, blocked and changing-output states. They assert unchanged work-area height, material/wiring/recovery control positions, scroll height and focused control, with AXE checks. The four focused component tests pass; the complete application/renderer suite passes **375 tests**. Application/template lint, documentation checks, whitespace checks and production build also pass.

Source and regressions: [Factory panel](../../../src/app/features/game/field-kit/factory-panel.component.ts), [template](../../../src/app/features/game/field-kit/factory-panel.component.html), [styles](../../../src/app/features/game/field-kit/factory-panel.component.scss), [browser tests](../../../src/app/features/game/field-kit/factory-panel.component.spec.ts). These are local working-tree results; no new hosted CI run is implied.
