# Player progression and crafting

Agreed direction recorded 27 October 2026, including the MiniFab acquisition, baseline operation and optional winding decisions. These are design requirements, not implemented gameplay. The [GDD](GDD.md) owns the overall game direction; the [TDD](TDD.md) owns technical rules, and the [roadmap](../plans/README.md) tracks implementation separately.

## Progression principles

- Terraform a damaged world through peaceful factory building. The researched greenhouse is the source of restoration. Antagonistic forces and a game-over state are outside the current direction.
- Research every crafting capability. Group related recipes into useful technologies rather than requiring a separate discovery for every small item. Gathering and field research must be available before any recipe is unlocked.
- Start with mixed scrap, metal plates, recovered wire, mechanical parts and electrical parts. These remain useful inputs to later branches throughout the playthrough, even when more advanced items consume them indirectly.
- Keep mandatory manual work brief. The Mini Fabricator (MiniFab) lets crafting continue without power while the player performs other work. Optional winding and later crafted power upgrades increase its speed; factory machines and logistics subsequently remove feeding and hauling.
- Introduce solar and wind before polluting generation. Coal is an optional, very high-power route with an environmental cost, never a prerequisite for green progression.
- Preserve material value through dismantling into scrap, including dismantling crafted items. Recovery is a design requirement, not a partial-refund penalty.
- Allow progress through the research tree regardless of environmental choices. Pollution pushes back against greening, but cannot permanently lock the player out of cleaner technologies or recovery.

## Opening and pacing

1. Teach basic movement, then lead the player to nearby scrap promptly.
2. Gather loose scrap without supplied tools and contribute it to early field research.
3. Unlock improved tools in about a minute of the early opening. Exact timing relative to the tutorial is a playtest detail.
4. Research the MiniFab using collected scrap only, then manually assemble the base device directly from scrap. Refined materials, prior crafted-output milestones and electricity are not prerequisites. Research basic material/component recipes through the opening tree separately.
5. Feed ingredients and request a batch in the MiniFab panel beside player inventory; it makes missing unlocked, compatible intermediates before the selected output while the player performs other work. Crafting always runs at baseline speed without charge; winding is an optional boost.
6. Expand into renewable power, mixed-output recycling, general fabrication and extraction. Manual feeding is a useful intermediate stage.
7. Sort and transport recycler output, automate supply, and scale research through dedicated laboratories.
8. Research greenhouse restoration, improve the energy/material economy, and spread greening across the world.

A relaxed first-time player should reach the first automatically executed, manually fed crafting within 15–20 minutes; an experienced player should be able to reach it in under five minutes. These are balancing targets, not minimum timers or compulsory waits. The first automated crafting checkpoint is the Mini Fabricator, not a complete conveyor-fed factory. The exact first few technology dependencies remain to be authored against these targets.

The empty-handed start remains the baseline. MiniFab research is reachable through collecting scrap alone, and its separate assembly cost also uses scrap alone. The player earns and builds it; there is no supplied starting device or unique recovered core. Assembling this researched bootstrap device must not require an existing fabricator. Exact scrap quantities, research/assembly times and ordering relative to the first tool remain open.

## Materials and early crafting tree

| Material or item | Early source or recipe relationship | Long-term role |
| --- | --- | --- |
| Mixed scrap | Loose salvage initially; later extraction and dismantling | Shared starting material and recovery form |
| Metal plates | Recovered/worked from scrap after research | Structural inputs to parts, equipment and later branches |
| Recovered wire | Recovered from mixed scrap after research | Electrical inputs throughout later branches |
| Mechanical parts | Made from plates | Inputs to tools, equipment and advanced assemblies |
| Electrical parts | Made from plates and wire | Inputs to powered equipment and advanced assemblies |
| Base MiniFab | Scrap-only field research followed by separate scrap-only manual assembly | Personal baseline crafting; later upgrades use refined materials |
| Tools, equipment and MiniFab upgrades | Researched combinations of basic materials and parts | Better collection, MiniFab upgrades, power, extraction and factory construction |
| Dedicated research craftables | Later manufactured combinations of earlier components | Feed scalable laboratory research |

These are recipe relationships, not finalized quantities, durations, stable content IDs or a deterministic recycler recipe list. Basic recovery must be possible before a powered recycler exists. Later pure iron, copper and other ores provide more targeted sources; they should feed the established component branches rather than make the opening components obsolete.

The [draft opening catalogue](opening-catalogue.md) proposes the first five technologies, hand/MiniFab recipe boundary, initial costs/times, full material-value checks and a route into the first factory. Its new boundaries and numbers remain proposals for review, not additions to the agreed requirements above.

## Manual actions and automation

| Activity | Player capability | Automation progression |
| --- | --- | --- |
| Gather loose scrap | Available without a crafted tool | Better researched tools, then extraction machinery |
| Work tougher deposits | Research and craft the appropriate tools | Powered extraction; pure ore sources later |
| Craft basic materials and equipment | Use unlocked bootstrap recipes, then feed the Mini Fabricator | General fabrication machines and supplied production lines |
| Move materials | Carry and feed/collect within interaction reach | Direct machine connections, conveyors and sorting |
| Research | Timed field research using carried materials | Faster dedicated laboratories; scale by adding labs |
| Generate power and treat water | Construct, supply and configure equipment | Renewable generation, storage and continuous treatment |
| Terraform | Research and establish greenhouses and supporting infrastructure | Green technology supports greening; pollution opposes it |

Unlocked basic crafting remains a recovery route. Which later recipes are machine-only is still a content decision; do not assume the Mini Fabricator can execute every researched recipe. Factory-only recipes cannot become automatic Mini Fabricator prerequisites. Manual machine supply remains supported even after conveyors are unlocked.

## Mini Fabricator

The Mini Fabricator (MiniFab) is a personal crafting subsystem, separate from the Basic/Medium/Advanced factory-machine tiers. Present it as its own UI panel beside player inventory, not as a normal inventory-slot item or a placed factory machine. Controls for future capabilities are added as those capabilities are unlocked and made operational; research alone does not grant a free upgrade.

### Acquisition and baseline speed

- Its research uses collected scrap only; no refined components, existing fabricator, electricity or crafted-production milestone is needed.
- After research, the player manually cobbles the base MiniFab together from scrap, paying its separate construction cost.
- The baseline device requires no power, fuel or charge. It always progresses when a valid job has ingredients and output capacity, including at night or during power shortages.
- Basic items craft quickly enough to avoid frustration. More complex eligible items take substantially longer, making upgrades and factory production worthwhile. Exact durations and recipe eligibility remain balancing decisions.
- Upgrades use more refined materials, keeping the base component tree useful. Do not retrofit an energy requirement onto baseline crafting when a power upgrade is added.

### Initial capability

- The player feeds ingredients and selects one final item type to produce automatically while doing other work.
- The requested batch is bounded by that item's stack-size limit. Initial operation is not a queue of unrelated final item types.
- When required inputs are missing but enough raw materials have been supplied, schedule the necessary unlocked, Mini-compatible precursor recipes first, then make the selected final item.
- The single-final-item restriction permits internal precursor jobs of other item types. Reuse available intermediates before making more, and retain any legitimate batch surplus.
- Do not bypass research, extract new world resources, simulate random recycling, or invoke unavailable factory-only recipes during prerequisite planning.
- Validate the dependency chain and total material requirements before spending. A missing or cyclic recipe, insufficient materials or blocked output must not lose or duplicate resources.
- Preserve requested output, precursor work, reservations, remaining work and finished-but-blocked output as plain state, ready for saving.

The handling of an unaffordable request (reject immediately or retain a clearly blocked request), exact batch rounding, cancellation, output collection and the relationship between existing stock and the stack cap remain to be specified.

### Optional winding and local charge

The initial MiniFab supports an optional winding interaction that charges a small internal battery and temporarily increases crafting speed. An empty battery removes the bonus; it never stops baseline crafting. The battery can be upgraded later through researched, crafted upgrades.

- Show an actual crank in the MiniFab panel. With a pointer, the player presses/grabs it and winds around its center through multiple turns to generate charge; a click or button hold alone is not the winding mechanic.
- With a controller, rotate the right stick through multiple turns while the crank control owns input. This must not also orbit the world camera or trigger other gameplay actions.
- Derive charge from performed winding movement, not elapsed UI time, repeated clicks, frame rate or tiny back-and-forth jitter. Detailed direction, turn validation, sensitivity and charge limits remain to be designed.
- Keep the interaction novel and mildly tedious after repeated use, encouraging later automation. It is never a mandatory action or a gate to crafting/research progression.
- Provide an accessible keyboard/remappable equivalent for the same boost, with consistent charge limits. Novel pointer/stick gestures must not make the speed benefit inaccessible.
- Other physical inputs, such as shaking a device with an accelerometer, are exploratory options. They require supported-device checks, explicit opt-in/permissions where needed, consistent charge limits and a fallback; they are not promised Milestone 3 features or a commitment to mobile support.
- Keep charge, capacity, boost consumption and upgrades in simulation-owned plain state. Losing focus, releasing the control or changing input ownership ends winding immediately; no stale input or hidden-time charge is replayed.
- The local charge mechanic is separate from factory electricity in Milestone 3. It does not need generators, grid connections, factory batteries, weather or an energy-network implementation.

Exact charge per turn, capacity, discharge rate, speed multiplier, baseline recipe durations and how boosts combine remain open. Future powered sources must preserve the same always-available baseline.

### Researched and crafted upgrades

Possible speed/power upgrades include onboard solar, onboard wind, coal and a grid connection. Coal's speed benefit carries a pollution cost. Onboard renewable behavior and grid integration join the related systems when they exist; none is a prerequisite for Milestone 3. Small-battery capacity/charging and later inventory-driven automation are additional upgrade paths.

Every technology-based MiniFab upgrade follows this sequence:

1. Unlock the related general technology, such as solar power.
2. Research its separate MiniFab-specific upgrade, such as MiniFab solar.
3. Craft the actual upgrade using its material recipe before applying its effect.

General research does not directly upgrade the MiniFab, and completing the MiniFab-specific research only unlocks the upgrade recipe. Nothing is installed or accelerated for free. Exact upgrade costs, fitting/removal rules, coexistence of power sources and bonus stacking remain open. Grid connection is deferred until electricity is implemented; coal emissions must be accounted for when that upgrade arrives.

### Later automation upgrade

An upgrade lets the player configure automatic production when the relevant ingredients are in the player inventory. It supports configurable minimum/maximum input-consumption and output-production limits. The initial manually fed device does not already have this inventory-driven behavior.

Define the trigger rules, reserve interpretation, batch limits, output destinations and competing-inventory-consumer priorities before implementing the upgrade. Do not silently substitute a single output cap for the requested input and output controls. The unlock belongs in later research; its exact technology and milestone slice remain open.

## Recycler and factory fabrication

The recycler processes mixed scrap into a random mix across its output catalog. It is not a general fabricator with one selected deterministic output recipe. Sorting the resulting stream is part of the logistics challenge. Later extraction of pure ores reduces that mixed-output problem.

Before implementation, specify the output catalog, probabilities, batch sizes, material-value accounting, fairness/availability expectations and blocked-output behavior. The simulation must own a seeded random stream and save its state and already-selected pending output; reloading or a full buffer must not reroll results.

General fabrication machines select recipes by input arity. Input arity means the number of distinct ingredient types, not the number of individual units or output types.

| Machine | Supported recipe inputs | Explicit exclusions |
| --- | --- | --- |
| Basic Fabricator | Exactly one ingredient type | Two-, three- and four-input recipes |
| Medium Fabricator | Exactly two ingredient types | One-, three- and four-input recipes |
| Advanced Fabricator | Three or four ingredient types | One- and two-input recipes |

Higher tiers do not replace the lower tiers. Preserve useful roles for all three. The Mini Fabricator and recycler have their own rules and must not inherit these restrictions accidentally. Availability of each factory tier is staged through research; exact technology placement is not yet fixed.

## Logistics and later transport

Use direct machine input/output connections and conveyors initially. Sorting mixed recycler output belongs in the initial logistics design; a plan that defers all sorting does not satisfy this progression. Choose the first filter/sorter and overflow rules before implementing transport.

Trains are a later-game direction and require loading/unloading stations. They are not part of the first small-map prototype or a reason to add train systems to the initial conveyor milestone.

## Research progression

Early discoveries use basic extracted items, then basic crafted items. Later research uses dedicated manufactured research craftables; their names, recipes and tiers are not final. This replaces the earlier no-science-pack rule.

Field research accepts contributions from player inventory and takes simulation time. It is slower than a dedicated laboratory and is necessary during the opening. Laboratories perform the heavy lifting after unlock and reward building several through scalable research throughput. Both paths contribute to authoritative saved research progress; neither is an instantaneous pay-and-unlock action.

Retain cumulative production eligibility and material payment as separate concepts. Completed crafting and machine output count toward production history; use a separate extraction history for raw-resource eligibility rather than reclassifying transfers as production. Research consumes contributed materials once while preserving lifetime counters. Crafting newly unlocked equipment has a separate cost. Moving existing items, collecting output and dismantling refunds do not increase either history.

The exact contribution/reservation model, progress rate per material, parallel-lab coordination and field/lab work combination remain open. They must prevent duplicate payment, overspending a completed technology, and free progress from cancel/reload. Whether crafting again from fully recovered scrap should earn repeat production eligibility is also unresolved; the refund itself never counts as new production.

The proposed technology groups are material recovery, basic fabrication, renewable power, mixed recycling, extraction, sorting/logistics, industrial fabrication/research, storage, water treatment and greenhouse restoration. Coal/high-output polluting technologies and later pollution mitigation form optional branches. This is a dependency-planning outline, not a finalized catalog: audit that every research cost and required machine is obtainable through earlier unlocks.

## Resources and dismantling

Deposits are finite but very generous. Exhausting the initial resources should be unrealistic in ordinary play, requiring days of deliberate consumption. Encourage a player who lingers in the opening to progress rather than making depletion the normal pressure. Exact quantities and the tone/timing of those prompts remain balancing work.

Future world configuration should expose resource settings. Configurable world generation is a later feature; record configuration-ready balance values without adding its UI to the current prototype.

All material embodied in dismantled buildings and crafted items is recoverable as scrap, with no deliberate partial-refund loss. Work in progress, contents and blocked output also need an explicit recovery path; dismantling must not silently destroy them. Define sufficient output capacity or another safe destination before completing recovery.

Specify a consistent material-value ledger before assigning recipes, random recycler yields and scrap refunds. Craft–dismantle loops must not mint extra scrap. How research-consumed materials, burned fuel, used water, liquids and other process consumables relate to “nothing is wasted” is not yet settled; do not invent refunds for irreversible consumption or silently weaken the full dismantling commitment.

## Energy, weather and terraforming

- Solar and wind are the first power technologies. A complete green research path must be viable without researching or burning coal.
- Solar generates only during daylight.
- Wind varies throughout the day and always supplies at least a defined minimum outside a Dunkelflaute event. During such an event, the usual wind floor is not guaranteed. Event frequency, duration, strength, solar effects and forecast information remain open.
- Storage and demand management provide ways to handle variable generation. A temporary shortage can pause machinery; it is not a game-over condition.
- Coal is optional and supplies massive power relative to early renewables, at a pollution cost. Later research can reduce that impact; it does not erase the need to define actual emissions.
- The overall goal is to terraform the world. Greenhouses must be researched and act as the source of restoration; the opening does not grant a functioning greenhouse.
- Green technologies contribute to greening; polluting technologies push back against it. Player choices determine the difficulty and pace. Pollution must not block research progression, cleaner alternatives or eventual recovery.
- The experience is peaceful, without planned antagonists or a fail state. Exact restoration rates, spatial spread, possible temporary regression and completion thresholds remain open.

A small-map restoration demonstration is a prototype checkpoint, not the full world-terraforming endpoint. The earlier mandatory coal opening and fixed greenhouse-survival-through-one-day/night proposal are superseded. Day/night and weather remain important operating conditions, but a missed interval must not imply losing the run.

## Decisions to settle before implementation

1. Final bootstrap ordering and costs: first tool, scrap-only MiniFab research/assembly and the first recovery recipes. Acquisition, inventory-side panel and power-free baseline are settled; choose durations against the opening pacing targets.
2. Initial recipes, stack sizes, capacities, interaction ranges, durations, tool behavior and whether field research can run concurrently with other player activities.
3. MiniFab prerequisite planning, cancellation, insufficient-input behavior, recipe eligibility/complexity times, crank input/charge balance, accessible equivalents and later upgrade/min-max policies.
4. Research costs, cumulative eligibility, contribution/reservation rules, timed work and scalable shared lab progress.
5. Scrap material equivalents, full refunds and treatment of consumed resources, recursive recipes and repeated crafting history.
6. Recycler random distribution and material availability guarantees; first sorting/filter and overflow behavior.
7. Renewable curves, wind minimum, storage and Dunkelflaute behavior, including a viable coal-free opening.
8. Greenhouse needs, restoration spread, pollution/mitigation rates and measurable small-map and eventual world goals.

These open details do not undo the agreed requirements above. Resolve the relevant subset before its milestone is implemented, and record changed decisions here rather than treating a checklist as evidence of completed code.
