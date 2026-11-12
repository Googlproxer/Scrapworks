# Runtime UI reference screenshots

Captured 13 November 2026 from the integrated game, not the standalone art proof. The [runtime guide](../../../../../../docs/art/ui-runtime.md) lists the shared components and full screen coverage. Artwork is unchanged; these are direct browser PNG captures.

The [validation record](validation.json) records checks, viewport sizes, source paths and screenshot hashes. All 217 focused UI tests passed; 19 development and 19 production UI states passed AXE with no violations or runtime errors. Detailed local diagnostics remain ignored under `docs/reports/ui-kit-2026-11-13/`; they are not CI gameplay routes.

Small and short windows deliberately scroll inside their frames. The loading image uses JavaScript disabled; its AXE audit uses application scripts withheld because the audit needs browser timers. Third-party Babylon Inspector controls retain their SDK theme.

| Screen                                    | Reference                                                          |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Main menu                                 | [main-menu.png](main-menu.png)                                     |
| HUD and sprite toolbar                    | [hud.png](hud.png)                                                 |
| Inventory, crafting and MiniFab           | [field-kit.png](field-kit.png)                                     |
| Compact inventory                         | [field-kit-compact-inventory.png](field-kit-compact-inventory.png) |
| Compact crafting                          | [field-kit-compact-crafting.png](field-kit-compact-crafting.png)   |
| Compact MiniFab and crank                 | [field-kit-compact-minifab.png](field-kit-compact-minifab.png)     |
| 320 by 568 window                         | [field-kit-small.png](field-kit-small.png)                         |
| 1280 by 480 window                        | [field-kit-short.png](field-kit-short.png)                         |
| Research tree and queue                   | [research.png](research.png)                                       |
| Factory and environment                   | [factory.png](factory.png)                                         |
| Controls                                  | [controls.png](controls.png)                                       |
| Compact Controls                          | [controls-compact.png](controls-compact.png)                       |
| Graphics settings                         | [graphics.png](graphics.png)                                       |
| Pause and saves                           | [pause-saves.png](pause-saves.png)                                 |
| Live machine and water inspection         | [machine-inspection.png](machine-inspection.png)                   |
| Notification tones                        | [notifications.png](notifications.png)                             |
| Save confirmation                         | [save-confirmation.png](save-confirmation.png)                     |
| Unfinished work confirmation              | [unfinished-work.png](unfinished-work.png)                         |
| Asset credits                             | [credits.png](credits.png)                                         |
| Loading fallback with JavaScript disabled | [loading.png](loading.png)                                         |
