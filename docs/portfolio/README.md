# Scrapworks local portfolio handoff

Scrapworks is a browser-first factory and restoration prototype. Start empty-handed on a damaged small map, salvage and research useful equipment, build renewable-powered industry, automate supply and sorting, and bring clean water to greenhouses. Restore every land and water cell to full health once, then keep playing. Coal offers another production choice with local pollution and recoverable environmental costs; there is no game-over state.

This delivery uses the existing procedural terrain/machines and protagonist. The separate [asset plan](../plans/portfolio-assets-and-final-qualification.md) remains deferred. Its final presentation/performance approval is separate from the current-asset baseline. The target for a new player's first restoration run is 30–60 minutes; **human pacing remains provisional pending the user's later playtest**.

## Run the local artifact

Use Node 24.21 or a compatible later Node 24 release. Extract the handoff ZIP, then run:

```powershell
node serve.ts --directory browser --port 4173
```

Open [the local demo](http://127.0.0.1:4173/). Keep the same address/port to retain that browser's local saves. Stop the preview with Ctrl+C. Opening `index.html` as a file does not provide the required worker/storage origin.

The package includes the browser output, its Brotli sidecars, this standalone Node preview, delivery notes and a build/asset identity manifest. The preview serves Brotli when accepted and original files otherwise. A later host must serve `index.html` for application routes, retain relative asset paths and correct JS/model/font/WASM content types, and negotiate `.br` siblings with `Content-Encoding: br` and `Vary: Accept-Encoding`. Hosting/upload/public release remain separate.

## Controls and objectives

Use the compact objective guide to find the next action; hide/reopen it whenever useful. **Tab → Field manual** explains crafting, research payments, power, facing ports, weather, restoration and saves. The guide derives progress from gameplay, including loaded advanced runs, and adds no tutorial-save flags.

- WASD / left stick moves; Shift / stick press sprints. Right drag / right stick orbits.
- Approach scrap within two metres, then hold F or toggle G to salvage. E / click picks up ground items.
- Tab opens the field kit. Research and equipment construction require separate payments; an unlock supplies no free equipment.
- Assign crafted placeables under Equipable. Select 1–8, B builds, R rotates. Power wiring uses two endpoints; click the first endpoint again to cancel without spending.
- MiniFab crafting works without power. Pointer/arrow-key/controller winding supplies an optional boost; depleted charge never stops baseline crafting.
- Menu / Escape pauses. Controls can be reviewed/rebound in the Controls dialog.

Inventory & Crafting, Research, Factory and Field manual are keyboard tabs with arrow/Home/End navigation. The manual's scroll area is keyboard focusable. Status/help text explains how to resolve missing inputs, shortages, blocked output, disabled machines and depleted deposits. The 400-cell restoration checkpoint stays completed after later pollution; positive influence can recover it.

## Save ownership and recovery

Use named local runs, manual saves and two-active-minute autosaves. Each run retains five auto and three manual revisions. Pause/hidden time does not advance the world; there is no offline production. A pending write is not committed progress.

Use **Save & load** to inspect revisions, recover a valid older one or validate/import JSON as a distinct run. Deliberate activation replaces play; simply inspecting a backup or history does not. **Download current progress** remains available when browser storage fails. Each browser profile and origin has separate IndexedDB data; export/import transfers a run and protects against cleared/evicted site data.

The supported save baseline is M9 schema 2 with exact authored-map/native-physics compatibility. Unsupported or invalid data is rejected while preserving play and prior revisions. These UI changes do not change the authored map, content version, numeric balance or save schema.

## Rebuild from source

From the repository root, use the pinned Yarn version and lockfile:

```powershell
corepack enable
yarn install --immutable
yarn build --stats-json
node tools/portfolio/serve.ts --directory dist/scrapworks/browser --port 4173
```

The build exports the Editor scenes and compresses the production output. No runtime network service, Fibery account, cloud save service or editor is required by the packaged browser application. Angular owns UI, Babylon owns presentation, the Editor owns authored layout, and one plain-TypeScript Miniplex worker owns authoritative gameplay/native physics. Dexie/IndexedDB stores versioned detached snapshots.

Run `yarn portfolio:package` to create a handoff directory under `dist/`. Packaging always re-exports and rebuilds the production output with stats and Brotli sidecars before recording its manifest; changes to public assets, Editor sources or build configuration are included. A failed rebuild stops packaging.

## Portable browser and hardware diagnostic

Copy/clone the source and install locked dependencies on the later machine. Install the matching Playwright browsers, build the production artifact and run:

```powershell
node node_modules/playwright/cli.js install chromium firefox
yarn build --stats-json
node tools/portfolio/run.ts --browser all --headed --output docs/reports/milestone-10/my-device
```

Run plugged in, with the preview visible and other heavy work closed. The diagnostic uses temporary browser contexts and controlled fixtures; it does not touch personal browser profiles or user saves. Node and both browser processes must be allowed to access their local loopback servers. In a restricted Windows environment, set `PLAYWRIGHT_BROWSERS_PATH` to an installed cache if the default sandbox cache differs.

Use `--browser chromium` or `--browser firefox` for one engine, and `--workload renewable`, `mixed` or `stress` for one fixture. Default full measurements use three warmed 30-second frame samples per case, real active-time autosave observation, twelve UI save/reload samples and isolated browser-inline phase/storage/1,000-step continuation checks. Crowded-map stress is labelled separately. `--quick` is a harness smoke with fewer samples and no autosave observation; `--no-autosave` is explicitly partial evidence. Neither replaces a full baseline.

Use `--save path/to/checkpoint.json` instead of `--workload` to measure a validated current-map export without diagnostic grants or layout edits. Choose a checkpoint with handcrafting finished or deliberately cancelled; the movement diagnostic will not close unfinished crafting on your behalf. A supplied file is not automatically evidence of earned play: retain the separate route/provenance record. Mid-handcraft persistence remains covered by the save acceptance suite.

Results include source/dirty/build/asset identities, browser/OS/CPU, renderer metadata, exact fixtures/counts, sample distributions, gates, screenshots, navigation cancellations and failures. Raw frame intervals and save/load samples remain available. Phase timings from the inline browser control are labelled separately from production rendering; they do not claim internal production-worker CPU/delivery timing. Browser-specific metrics that are unavailable or not instrumented remain explicit limitations. Headless/software-renderer results do not qualify physical display cadence. A baseline pass cannot qualify final assets or another device.

The optional `--worker-probe` wraps step/publication/capture/handle methods inside the actual Chromium production worker, without adding a production API or altering commands. Keep this separate from the standard frame-comparison protocol: wrappers add overhead. Firefox 159/Juggler crashed during this dynamic-import probe, so that metric is explicitly unavailable there and its production worker stays unmodified; Firefox's inline controls are labelled separately. Transport queue/delivery and host/render costs are not mislabelled as worker CPU. Continue click-to-playable, full page reload and automation actionability waits are separate fields. `--save-samples 12` can retain twelve save/load observations during a `--quick` timing-boundary smoke; its short frame window and missing autosave observation remain partial evidence.

Detailed results remain local/untracked in `docs/reports/`. Preserve them for comparison when the later asset plan runs the same protocol against final exports. Do not copy timings across different browser/driver/fixture settings without identifying the differences. Full routes, baseline/soak diagnostics and performance comparisons reject CI/GitHub Actions; focused static-serving, packaging and CI-guard tests join routine tooling correctness coverage. Packaging tests use a small build stand-in.

## Recorded support and evidence

The 10 November 2026 current-PC checks used Chromium 158.0.8127.18 and Firefox 159.0 on Windows 10.0.26300, Ryzen 9 7900X3D and Radeon RX 6800 XT. Both pass production lifecycle/input, IndexedDB recovery/transfer, research keyboard interaction and tested AXE states. Prepared-layout normal frame p95 stays at or below 10.34 ms and manual commit p95 at or below 88 ms. Corrected twelve-sample mixed-layout Continue click-to-playable p95 is 1.335 s Chromium / 1.900 s Firefox. Isolated autosave hitches remain, especially stress; these observations do not qualify final assets or all-workload load tails. The [tracked implementation summary](../plans/milestone-10-portfolio-prototype.md#implementation-verification--10-november-2026) records detailed sample boundaries, limits and deferred gates.

## Capture and later playtest

For portfolio captures, show the empty-handed objective, a renewable workshop with sorted transport and a restored landscape. Use a real earned run for gameplay claims; the diagnostic's prepared fixtures are labelled testing material. Capture current screenshots as provisional until the asset follow-up refreshes them.

For the later human test, start a new run without grants or prior unlocks. Record wall time and active play at: first tool, first MiniFab output, first renewable workshop, automatic supply/sorting and first all-map restoration. Note long waits, external instructions, confusing controls, mistaken payments and recovery difficulties. Keep new-player and experienced-player observations separate. Scripted/accelerated routes establish reachability, not human usability or the 30–60 minute target.

## Scope and provenance

The prototype includes the opening, shared research/labs, paid machines, direct/conveyor/sorter transport, renewable variability/storage, water/restoration, optional coal/mitigation and resilient local persistence. Current presentation is functional prototype art. Source projects/provenance remain under [art](../../art/README.md), including [procedural machine provenance](../../art/machinery/runtime-prototypes.md) and [protagonist runtime preparation](../../art/characters/Protag/v3/runtime/README.md). The existing asset plan owns the later complete presentation/attribution audit.

No second/lower-end device, mobile/touch gameplay, other engines, final assets, public hosting, accounts/cloud sync, remote control, extra maps/tiers, personal MiniFab upgrades or multi-worker architecture is claimed by this delivery.
