# Development export and recovery validation — 23 October 2026

The [verification record](verification.json) was produced by `node tools/scenes/check-dev-workflow.mjs` using an isolated project copy, the real Editor CLI, native saved-input watcher, Angular/Vite and installed Playwright Chromium. The test used localhost access and `PLAYWRIGHT_BROWSERS_PATH=C:\Users\googl\AppData\Local\ms-playwright` on this workstation.

The initial MainMenu loaded. A valid saved scene change exported and reloaded; malformed saved JSON did not reload or change any published scene/world/script hashes; correcting the save recovered and reloaded automatically. Play Game then loaded the world with one canvas, no alert and no browser errors.

This verifies the authoring/recovery workflow after marker compilation and asset cleanup. It does not claim gameplay persistence or completion of later gameplay milestones. Superseded workflow reports are recoverable from Git through the [cleanup record](../../../plans/3d-cleanup.md#recovery).
