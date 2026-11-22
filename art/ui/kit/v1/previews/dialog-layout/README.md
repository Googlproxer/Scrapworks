# Dialog layout and crafting references

Captured from Scrapworks on 16–17 November 2026 (Sydney time). These are direct browser captures using an isolated browser profile and prepared gameplay saves. The original kit artwork is unchanged.

The research follow-up on 17 November gives the graph the main workspace, with selected technology details and the queue in a right sidebar. Long guidance is under Research help. At 1234×898, the graph viewport is approximately 775×439 px. Narrow panes stack the details below the graph. The layout regression test fills the queue and checks that it cannot shrink the graph.

The crafting view has two desktop columns: inventory and crafting. Handcrafting fills the crafting pane initially; MiniFab ownership replaces it with the device's recipe, ingredients, request and crank controls. Compact layouts offer Inventory and Crafting views. Turning the crank keeps the scrollable bounds fixed.

| Reference                                                             | Window   | Build       |
| --------------------------------------------------------------------- | -------- | ----------- |
| [Initial handcrafting](handcraft-desktop.png)                         | 1220×870 | Production  |
| [Inventory and MiniFab](minifab-desktop.png)                          | 1220×870 | Production  |
| [Compact crafting](minifab-crafting-640.png)                          | 640×844  | Production  |
| [Phone crafting](minifab-crafting-390.png)                            | 390×844  | Production  |
| [Narrow crafting](minifab-crafting-320.png)                           | 320×844  | Production  |
| [Short crafting, scrolled](minifab-short-scrolled.png)                | 320×320  | Production  |
| [Controls](controls-desktop.png)                                      | 1220×870 | Production  |
| [Graphics actions](graphics-short.png)                                | 320×320  | Production  |
| [Pause and saves](pause-desktop.png)                                  | 1220×870 | Production  |
| [Pause, scrolled](pause-short-scrolled.png)                           | 320×320  | Production  |
| [Main menu](main-menu-short.png)                                      | 320×320  | Production  |
| [Expanded Save/Load](save-load-short.png)                             | 320×320  | Production  |
| [Save confirmation actions](save-confirmation-short.png)              | 320×320  | Production  |
| [Unfinished-work actions](unfinished-work-short.png)                  | 320×320  | Development |
| [Research](research-desktop.png)                                      | 1234×898 | Development |
| [Compact research](research-compact.png)                              | 390×844  | Development |
| [Factory](factory-desktop.png)                                        | 1220×870 | Development |
| [Field manual](field-manual-compact.png)                              | 390×844  | Development |
| [Water inspection](water-inspection-compact.png)                      | 390×844  | Development |
| [Greenhouse inspection, scrolled](greenhouse-inspection-scrolled.png) | 390×844  | Development |
| [Loading error and Retry](loading-error-short.png)                    | 320×320  | Development |

The audit covers every application dialog plus nested disclosures, binding editing, notification cards, the objective guide, debug-drawing controls and loading/error UI. Eight main test sizes range from 1600×1000 to 320×320, including 1280×480. It checks the visible control bounds against the non-background pixels of corner/edge repair assets, protects native scrollbar space, and checks expanded controls against each other after accounting for scroll clipping and separate overlay surfaces.

See [validation.json](validation.json) for the final check totals. Focused component tests cover ownership transitions, restored requests, retained unfinished work and winding input. Browser checks include AXE, horizontal overflow, fixed scrollable bounds at multiple crank angles, and a real pointer-driven turn in the production build. Development and production builds and ESLint pass. The production build retains the existing `eventery` CommonJS optimization advisory.

The detailed scripts and measurements are local/manual diagnostics under `docs/reports/dialog-audit-2026-11-16/`. They have local-only guards and use temporary profiles. Coverage is Chromium; these captures do not qualify other browser engines or a human gameplay playthrough. The Babylon Inspector retains its SDK styling.
