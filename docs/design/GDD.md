# Scrapworks Game Design Document

Updated 28 October 2026 for the component-led MiniFab opening and UI-bound safe handcrafting. Research-led crafting, Mini Fabricator progression, renewable-first industry and peaceful world terraforming are agreed direction. Gameplay remains unimplemented beyond the migration foundation.

Scrapworks is a web game about building an automated factory to terraform a damaged planet. The player balances industrial progress with the environmental impact of the machinery that enables it, in a peaceful experience without a fail state. This document records the overall gameplay direction; [Player progression and crafting](player-progression.md) records the detailed 27–28 October decisions and unresolved balance questions. Architecture and persistence are covered in the [Technical Design Document](TDD.md). Visual direction is covered in the [Art Document](../art/README.md).

## Agreed gameplay direction

- Present the world and directly controlled protagonist in 3D with an angled overhead camera. The renderer does not change the progression and research rules below.

- Factory building and automation are the main appeal, drawing on the player's enjoyment of Factorio and Satisfactory.
- The setting is a damaged planet that the player gradually restores.
- Energy choices affect restoration. Solar and wind come first. Optional coal offers massive power at an environmental cost; later research can mitigate pollution.
- The early prototype uses direct character control for exploration and construction.
- The baseline is an empty-handed start with no researched technologies. Gathering loose scrap and field research are starting abilities; crafting capabilities require research. Safe material/component recipes are handcraftable first. MiniFab research follows both mechanical/electrical branches, then separate hand assembly uses plates, wire and both parts.
- Initial inventory is 24 bag slots plus a separate equipped-tool slot, with no weight limit and later capacity upgrades. Simple items begin with configurable 100-item stacks; initial interaction reach is a 2 m circle with later upgrades. Salvage overflow drops on the ground with clear feedback. Craft starts use post-input-consumption space, and MiniFab output pauses safely if player actions fill that space; player actions take priority over automation.
- Mixed scrap, plates, wire, mechanical parts and electrical parts underpin the opening and remain useful throughout later branches. Researched safe assemblies stay handcraftable. Handcrafting requires its visible UI; warn before leaving, keep completed units and cancel/refund only unfinished work. Liquids and hazardous processes require suitable machinery.
- Durability is a potential later mechanic, not used or required in the current opening. Initial salvage uses a hold/toggle action, one scrap per 3 seconds by hand and one per second with the first handcrafted prybar.
- Active handcrafting protects result/refund capacity until completion or cancellation/refund. Other additions/transfers and MiniFab deliveries wait; enabled Field Research may consume uncommitted bag stock without occupying that space or taking the current unit's inputs. Handcraft refunds remain in inventory, never ground overflow.
- The MiniFab has its own panel beside inventory, executes researched handcraftable recipes initially and draws one complete operation's inputs just before starting a player-requested job. Each initial input/output buffer holds one operation, with stack-capacity upgrades later. It supports compatible precursors/direct buffer reuse, waits safely for missing inputs or blocked output and can ingest next-task inputs first when that frees delivery space. More complex items are slow at its power-free baseline.
- Optional winding uses an on-screen crank with pointer dragging, selected controller stick or directional keys. Five turn-equivalents fill the initial battery for 60 seconds of active crafting at 2x speed. Fractional and reversed handle travel count; idle/paused/blocked work consumes nothing, and empty charge falls back to 1x. Gearing reduces full recharge to one turn; capacity grows by 50% per unlimited level at doubling costs, without increasing turns-to-full. Novel device inputs remain exploratory.
- Later MiniFab solar/wind/coal/grid upgrades improve speed, with pollution from coal. Each requires the related general technology, separate MiniFab research and crafting the actual upgrade. Later upgrades add buffer capacity, hazardous/liquid handling and autonomous inventory-driven production with configurable input/output limits; initial per-request ingredient intake is already available. Nothing is granted for free by research alone.
- Research uses basic extracted items, then crafted components, then dedicated manufactured research craftables. Field research takes time and is slower than scalable laboratories.
- Research retains cumulative production eligibility and consumes material contributions while preserving history. Raw-resource eligibility uses separate extraction history. Payment and unlock/progress changes must occur exactly once.
- Deposits are finite but very generous. Disassembly returns full embodied solid value: scrap-origin materials as scrap, other materials as source ores for full reprocessing. Liquids are lost; advanced equivalence/provenance details come later. Cancelled unfinished MiniFab work instead keeps original ingredients, discards partial work and retains items in its buffers if inventory is full. Replacement recipes must use the same input types while residue remains; exact same recipe may continue with uncleared output only if another result fits. Every completed re-craft adds production history; refunds/dismantling do not.
- Recycler output is a random mix that logistics must sort. General fabrication tiers accept exactly one, exactly two, or three/four ingredient types respectively; higher tiers cannot replace lower-arity machines.
- Research unlocks greenhouses as the source of restoration. Green technology supports greening and pollution pushes back, without ending the run or locking out research and recovery.
- The prototype saves and loads progress locally in the browser. Accounts and cloud saves are future possibilities.
- Remote control is a future possibility as the factory expands. It is outside the early prototype scope.

## Proposed first playable milestone

Use a small map containing generous scrap deposits, water, renewable-energy conditions and space for researched greenhouses and industry. Coal can support the optional polluting branch. These are world features, not starting possessions.

The loop is: collect scrap, conduct field research, unlock basic crafting and tools, use a Mini Fabricator, establish renewable-powered recycling/fabrication, sort and automate supply, scale laboratory research, and build greenhouses to spread restoration.

The prototype introduces the Mini Fabricator, solar/wind, recycler, extraction, basic factory fabrication, sorting/conveyors, laboratories, storage, water treatment and researched greenhouse restoration. Coal is optional. Direct machine connections keep early logistics understandable. Exact recipes, capacities, weather parameters and timings remain to be designed; factory tiers and later upgrades are staged rather than all delivered in the opening.

The overall goal is world terraforming. The prototype demonstrates recoverable greening on one small map; its measurable completion threshold remains open. The former mandatory coal opening and greenhouse-survival interval are superseded. Night and variable wind affect operations, but shortages do not create a fail state.

## Proposed opening progression

1. Complete a basic movement tutorial and find nearby loose scrap promptly.
2. Use scrap in field research; unlock improved tools in about a minute of early play.
3. Handcraft plates/wire after Material recovery, then mechanical/electrical parts after their sibling research branches. Research Mini fabrication using parts and hand-assemble the four-ingredient device. This teaches crafting before background automation without requiring factory electricity.
4. Feed a single selected item batch in the inventory-side MiniFab panel, including automatic crafting of missing eligible intermediates, while doing other work. Optionally wind its crank for bonus speed; uncharged crafting remains available.
5. Establish solar/wind-powered recycling and fabrication, then automate extraction, sorting and transport.
6. Scale research through laboratories and dedicated craftables; unlock storage, water treatment and greenhouse restoration. Optional coal and pollution mitigation form branches.

Every technology must be reachable through earlier abilities and unlocks. Avoid circular Mini Fabricator, power, machine and research-kit requirements. Target first player-requested automatic crafting within 15–20 minutes for relaxed new players and under five minutes for experienced players. Keep mandatory manual work brief and preserve useful basic crafting after automation. See the [detailed opening](player-progression.md#opening-and-pacing).

## Energy and environmental restoration

Solar produces only during daylight. Wind fluctuates throughout the day but maintains a minimum output outside a Dunkelflaute event. Event behavior and storage balance remain open. A coal-free progression path must work. Coal offers much greater power as an optional trade-off; emissions slow or oppose greening, and later mitigation research reduces their impact.

Greenhouses require research and act as the source of restoration. Green technologies support greening while pollution pushes back. Show the relationship between industry, environment and restoration clearly. The player's choices determine the difficulty and pace; there are no planned antagonists or fail state, and pollution cannot block research or eventual recovery. Spatial spread, rates, possible regression and objective thresholds remain design work.

## Research progression

Every crafting capability is technology-gated, with related recipes grouped into meaningful unlocks. Early research accepts extracted resources, then crafted basics; later technologies use dedicated manufactured research craftables. This explicitly replaces the earlier no-science-pack rule. Inventory possession alone does not establish production history.

Count cumulative production within the saved world from completed player/Mini Fabricator and factory output, including work before a technology becomes visible. Keep raw extraction history separate. Transfers, collection of existing output and dismantling refunds do not add new extraction or production. Research progress, unlocks and both histories survive saving and loading.

Research consumes its material contributions exactly once and preserves cumulative eligibility. Crafting unlocked equipment has a separate cost. Several technologies can refer to the same production history, but each requires its own contribution. Show historical eligibility, current stock, contributed materials and work progress separately.

Field Research runs in the background while the player salvages/crafts, gradually drawing required materials directly from uncommitted player inventory. Missing inputs pause consumption/work automatically until available. Pause/disable or switching active technology preserves work and invested materials; research cannot be cancelled and consumed materials cannot be reclaimed. Turning it off stops bag withdrawals while labs may continue from their supplied inputs; enabling it permits inventory contributions alongside lab research. Labs offer scale, speed and later speed upgrades. Each paced cycle consumes one of each still-required material together; if any is missing, all consumption/work for that cycle waits. Materials already paid in full are no longer charged; neither source may duplicate payment or overshoot completed research.

The [progression specification](player-progression.md#research-progression) owns the detailed direction and open questions. Balance combined research, ingredient and equipment costs against opening pacing. Do not implement the former instantaneous research transaction or free starting recipes as current requirements.

## Character interaction proposal

Keyboard movement and mouse placement remain the starting control proposal. Construction happens within reach of the character, encouraging the player to explore the map and walk through their factory. Building previews should show placement validity and machine orientation. The camera and character appearance are specified in the [Art Document](../art/README.md).

## Saving and session behaviour

Local saving and loading are agreed for the prototype. Manual save slots, periodic autosaves with a retained previous save, and file export and import are proposed features. Their implementation is described in the [Technical Design Document](TDD.md).

The proposed prototype pauses when the game is hidden or closed and resumes from the saved simulation time, without offline production.

## Prototype scope and later possibilities

Keep the prototype focused on the research-led opening, Mini Fabricator, a small factory/research tree, direct transport with sorting, renewable power and peaceful restoration. Combat, character survival, antagonists and multiplayer are outside the current direction. The three fabrication tiers describe the broader tree; exact prototype tier coverage remains to be scoped.

Remote construction or control could become an earned capability once the factory grows beyond comfortable walking distance. Possible forms include drones or a control terminal; no implementation is selected yet.

Later directions include pure ore chains, trains with loading/unloading stations, player-configurable resource settings, the Mini Fabricator's inventory-driven upgrade, and research that reduces pollution. Exact placement in the larger tree remains open. Accounts, cloud saves and remote control remain deferred.

## Prototype success criteria

- Building a working production line feels satisfying.
- The player can progress from the empty-handed bootstrap to tools, Mini Fabricator and a renewable-powered factory without debug grants or coal requirements.
- Production milestones and material costs clearly explain how to unlock a technology, and locked equipment cannot be crafted or built.
- Timed field and laboratory research consume contributions exactly once while preserving cumulative histories.
- The player understands why pollution changes restoration progress.
- Variable solar/wind, storage and optional coal create meaningful decisions with visible consequences.
- Sorting mixed recycler output and the restricted fabrication tiers create useful logistics choices.
- Dismantling recovers full embodied material as scrap without duplication.
- The player can improve the system and see researched greenhouses spread restoration without a fail state or irreversible research lockout.
- Character movement makes exploring and building enjoyable on the small map.
