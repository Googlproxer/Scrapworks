# Player progression and crafting

Agreed direction recorded 27 October and revised 28 October 2026: safe handcrafting teaches materials/components before the MiniFab, with explicit UI-bound interruption and per-item refunds. The power-free baseline and optional winding remain agreed. These are design requirements, not implemented gameplay. The [GDD](GDD.md) owns the overall game direction; the [TDD](TDD.md) owns technical rules, and the [roadmap](../plans/README.md) tracks implementation separately.

## Progression principles

- Terraform a damaged world through peaceful factory building. The researched greenhouse is the source of restoration. Antagonistic forces and a game-over state are outside the current direction.
- Research every crafting capability. Group related recipes into useful technologies rather than requiring a separate discovery for every small item. Gathering and field research must be available before any recipe is unlocked.
- Start with mixed scrap, metal plates, recovered wire, mechanical parts and electrical parts. These remain useful inputs to later branches throughout the playthrough, even when more advanced items consume them indirectly.
- Keep mandatory manual work brief. The Mini Fabricator (MiniFab) lets crafting continue without power while the player performs other work. Optional winding and later crafted power upgrades increase its speed; factory machines and logistics subsequently remove feeding and hauling.
- Introduce solar and wind before polluting generation. Coal is an optional, very high-power route with an environmental cost, never a prerequisite for green progression.
- Preserve embodied solid material value through dismantling crafted items/buildings: scrap-origin material returns as equivalent scrap, other material returns as its source ore for full reprocessing. Liquids are lost; detailed liquid accounting comes later. Recovery is a design requirement, not a solid-material refund penalty.
- Allow progress through the research tree regardless of environmental choices. Pollution pushes back against greening, but cannot permanently lock the player out of cleaner technologies or recovery.

## Opening and pacing

1. Teach basic movement, then lead the player to nearby scrap promptly.
2. Gather loose scrap without supplied tools and contribute it to early field research.
3. Unlock improved tools in about a minute of the early opening. Exact timing relative to the tutorial is a playtest detail.
4. Research Improvised tools, then Material recovery, then the sibling Mechanical/Electrical assembly branches. Handcraft safe plates, wire and parts before researching Mini fabrication from crafted components. Hand-assemble the MiniFab from plates, wire, mechanical and electrical parts as the first complex device; neither an existing fabricator nor factory electricity is required.
5. Request a batch in the MiniFab panel beside player inventory; it draws each operation's ingredients just before starting, making missing unlocked, compatible intermediates before the selected output while the player performs other work. Crafting always runs at baseline speed without charge; winding is an optional boost.
6. Expand into renewable power, mixed-output recycling, general fabrication and extraction. Manual feeding is a useful intermediate stage.
7. Sort and transport recycler output, automate supply, and scale research through dedicated laboratories.
8. Research greenhouse restoration, improve the energy/material economy, and spread greening across the world.

A relaxed first-time player should reach the first automatically executed, player-requested crafting within 15–20 minutes; an experienced player should be able to reach it in under five minutes. These are balancing targets, not minimum timers or compulsory waits. The first automated crafting checkpoint is the Mini Fabricator, not a complete conveyor-fed factory. The exact first few technology dependencies remain to be authored against these targets.

The empty-handed start remains the baseline. The player earns the MiniFab through earlier safe handcrafting and both component branches, then pays its separate four-ingredient assembly cost. There is no supplied device or unique recovered core. Its construction must be handcraftable without an existing fabricator. The order and payment material families are agreed; exact quantities and durations remain playtest values. This 28 October revision supersedes the earlier scrap-only MiniFab path.

## Materials and early crafting tree

| Material or item | Early source or recipe relationship | Long-term role |
| --- | --- | --- |
| Mixed scrap | Loose salvage initially; later extraction and dismantling | Shared starting material and recovery form |
| Metal plates | Recovered/worked from scrap after research | Structural inputs to parts, equipment and later branches |
| Recovered wire | Recovered from mixed scrap after research | Electrical inputs throughout later branches |
| Mechanical parts | Made from plates | Inputs to tools, equipment and advanced assemblies |
| Electrical parts | Made from plates and wire | Inputs to powered equipment and advanced assemblies |
| Base MiniFab | Research after both assembly branches using mechanical/electrical parts; separately hand-assemble from plates, wire and both parts | First complex personal device; background crafting and eligible precursors |
| Tools, equipment and MiniFab upgrades | Researched combinations of basic materials and parts | Better collection, MiniFab upgrades, power, extraction and factory construction |
| Dedicated research craftables | Later manufactured combinations of earlier components | Feed scalable laboratory research |

These are recipe relationships, not finalized quantities, durations, stable content IDs or a deterministic recycler recipe list. Basic recovery must be possible before a powered recycler exists. Later pure iron, copper and other ores provide more targeted sources; they should feed the established component branches rather than make the opening components obsolete.

The [opening catalogue](opening-catalogue.md) records the agreed five-technology tree and safe hand/MiniFab boundary, with provisional quantities/times, conservation and pacing checks. Its numerical values and later factory content remain draft; no implementation is implied.

## Inventory, interaction range and overflow

Agreed 28 October 2026:

- The player starts with **24 bag slots**, a **separate equipped-tool slot** and **no weight limit**. Capacity upgrades arrive later; their acquisition/size remains to be designed. Unequipped tools use ordinary inventory space.
- Simple opening resources/components use **100-item stacks** as their initial values. Stack limits are per-item configuration, so later complex items can use smaller stacks. Tools/modules can retain their separate one-item policies; MiniFab ownership is not a bag item.
- Initial interaction reach is a **2-metre circle around the player**, measured on the gameplay ground plane; later upgrades can increase it. Initial salvage controls/rates and first-tool behavior are recorded below; the starting area uses 250,000 total scrap as a configurable playtest default. Distribution is authored/tuned in Milestone 3; later upgrade sizes remain future content.
- Completing salvage removes the extracted quantity from the deposit and sends what fits to inventory; excess becomes recoverable ground items. A full bag does not stop salvage or destroy output. Inform the player clearly that space is unavailable and output is on the ground. Deposit reduction, bag insertion and ground creation are one atomic result. Extraction history advances once for the newly salvaged quantity, including overflow; later pickup is only a transfer.
- Ground resources need stable identity, item type, quantity and position and must survive the future gameplay save/restore flow. Merge nearby same-item drops into recoverable piles and use deliberate pickup so the player controls freed bag space. Salvage spills and MiniFab held output remain distinct. Handcraft cancellation does not spill: protected inventory capacity guarantees room for original-input refunds; consume-only Field Research cannot occupy it.
- Before each handcraft unit starts, check whether its result fits **after consuming that unit's inputs**. Consuming an entire input stack may free the required slot, and an existing partial output stack may already suffice. Consuming part of a stack does not free a slot. Reject an impossible start without spending or beginning work; do not count slots from hypothetical consumption of the rest of a batch.
- MiniFab checks its actual input/output buffer capacities for the next complete operation. It initially pulls only that operation's ingredients from inventory at start. Buffered output may wait for bag space; when the next complete ingredient intake genuinely frees that space, ingest first and then deliver held output as one validated transition. Only actual bag removals count toward freed bag capacity. This request-driven intake is separate from later autonomous min/max replenishment.
- If player actions fill the bag during MiniFab work, commit the completed result into its output buffer once. Deliver when room is available; pause production when that buffer is full and inventory cannot accept the result, except for the validated next-input-ingestion transition described below. Notify, retain all output and resume automatically when capacity returns. Never overwrite player stock or spill MiniFab output.
- After manual player commands and handcraft input commitment, a player-requested MiniFab operation has priority over Field Research for competing uncommitted bag ingredients. Field Research uses the remaining stock and waits if its next complete synchronized bundle is unavailable. Revalidate each transaction in that order; neither automation path may consume the other's committed inputs or claim player inventory slots.
- **Player inventory actions take precedence over automation.** Automation cannot reserve bag slots exclusively against the player, evict player items or undo a manual action. Resolve player commands/manual inventory changes before automatic delivery attempts in the same simulation step, using current capacity at delivery. Finished-but-blocked output is persistent state; production is credited once when completed output enters its destination, including the MiniFab output buffer; later delivery/direct precursor transfer never credits it again.
- Handcrafting protects result/refund capacity across the active batch and its exit warning. Other inventory additions/transfers, MiniFab deliveries and future automatic bag-input withdrawals wait. Enabled Field Research is the consume-only exception: after player commands it may take uncommitted bag stock, never the current craft unit's already committed ingredients. Research cannot occupy slots or invalidate output/refund capacity. Revalidate inputs/capacity before each next handcraft unit; if research used stock needed for later units, stop before starting/spending that unit. Refund the unfinished unit before releasing the capacity protection. Idle crafting UI does not lock inventory. Supplied MiniFab work may finish and hold output while delivery waits.

## Salvage interaction and tool progression

Accepted 28 October 2026 as initial design/playtest settings:

- Highlight the selected deposit inside the 2 m circle. Hold Interact to repeat salvage cycles, with an accessibility toggle alternative. Stop on release/toggle-off, leaving range, depletion or UI/input ownership changes. Inventory fullness does not stop salvage: continue with ground overflow and a persistent, non-modal notice.
- Bare hands collect one scrap every **3 seconds**; the first researched/crafted prybar collects **one per second**. The current 4-scrap research and 4-scrap recipe need 24 seconds of tool-free gathering, or 34 seconds of serial gathering/research/crafting before travel/UI time. Keep that initial interval brief.
- Merge nearby same-item overflow into recoverable piles and use deliberate pickup. Pickup transfers existing items and never adds extraction/production history. It cannot mutate player inventory during active handcrafting without first cancelling/refunding that job through its warning flow.
- Automatically equip the first handcrafted prybar when the tool slot is empty, with clear feedback. Later replacements are explicit. Keep reach upgrades independent of collection speed.
- Milestone 3 requires only bare hands and the prybar before the MiniFab. A later mechanical salvage tool can improve bulk collection (approximately 2 scrap/second as a provisional target) and access tougher deposits after the MiniFab. Powered handheld tools belong to later electrical progression; stationary extractors supply continuous automation. Later recipes, costs and exact rates are not yet designed.
- **Durability is a potential later mechanic only.** There is no durability, wear or repair system in the current opening, and considering it does not add a committed later feature or milestone requirement.

## Manual actions and automation

| Activity | Player capability | Automation progression |
| --- | --- | --- |
| Gather loose scrap | Available without a crafted tool | Better researched tools, then extraction machinery |
| Work tougher deposits | Research and craft the appropriate tools | Powered extraction; pure ore sources later |
| Craft safe materials and equipment | Handcraft researched recipes while the crafting UI is open, using prepared inputs | MiniFab background/precursor work, then supplied fabrication lines |
| Move materials | Carry and feed/collect within interaction reach | Direct machine connections, conveyors and sorting |
| Research | Timed field research using carried materials | Faster dedicated laboratories; scale by adding labs |
| Generate power and treat water | Construct, supply and configure equipment | Renewable generation, storage and continuous treatment |
| Terraform | Research and establish greenhouses and supporting infrastructure | Green technology supports greening; pollution opposes it |

Every researched assembly using safe components remains handcraftable, regardless of item tier or ingredient count. Liquids, hazardous materials/dangerous outputs and specialist treatment require suitable processes. Safe finished components may be assembled manually even if their original manufacture needed specialist machinery; safe research craftables are not arbitrarily factory-only. MiniFab compatibility still respects actual process requirements and must not invent unavailable precursors. Manual machine supply remains supported after conveyors.

### Handcrafting and interruption

- Handcrafting is active work only while its UI is visible. Basic recipes are quick. Batches do not require repeated clicks per unit, and missing intermediates must be prepared manually; automatic precursor scheduling is a MiniFab benefit.
- Closing, hiding or leaving the handcrafting UI, or switching to conflicting work such as salvage, cancels the active job rather than allowing hidden background work. Before an intentional exit, show a clear warning that completed items are kept and the unfinished item is cancelled/refunded. Offer staying in crafting or cancelling and leaving; suspend handcraft progress while that warning is being resolved.
- Completed units are committed individually. Preserve them and their already-earned production history on cancellation; completed items subsequently consumed by enabled research are not recreated. Cancel only the current unfinished unit and remaining batch request; return that unit's exact original ingredients in full and release any unstarted reservations. Discard its partial work, produce no partial output and do not automatically resume later.
- A valid handcraft unit has guaranteed result/refund capacity: preflight checks actual post-input-consumption space and no other system may occupy its protected result/refund capacity. Enabled Field Research may only consume uncommitted stock; it never touches the current unit's inputs. Completed units enter inventory immediately. Finished-but-blocked delivery remains a MiniFab behavior, not a normal handcraft case. Recheck capacity before each next unit; if it cannot fit, do not start or spend its inputs.
- Example: after ten plates finish, leaving during plate eleven keeps the ten completed plates (except any already consumed by enabled research) and refunds plate eleven's scrap. Cancelling a mechanical part returns its reserved plates, rather than converting those inputs to scrap. This differs from dismantling a completed item.
- Refunds/cancellations never add extraction/production history or undo completed units. Duplicate close/interruption commands cannot refund twice. Return the unfinished unit's original inputs before releasing exclusive ownership; no intervening inventory addition can take their former capacity, and consume-only research can only free space. The refund-to-ground scenario is excluded by this invariant. This manual ownership never grants automation an exclusive claim on player slots.
- Abrupt UI teardown must enforce the same cancellation/refund invariant. Ordinary application suspension pauses simulation; it does not create background handcrafting. Restoring gameplay must not resume an unseen handcraft job.
- MiniFab work is separate: it can continue when its panel is closed or the player performs other work, subject to normal simulation pause/capacity rules.

## Mini Fabricator

The Mini Fabricator (MiniFab) is a personal crafting subsystem, separate from the Basic/Medium/Advanced factory-machine tiers. Present it as its own UI panel beside player inventory, not as a normal inventory-slot item or a placed factory machine. Controls for future capabilities are added as those capabilities are unlocked and made operational; research alone does not grant a free upgrade.

### Acquisition and baseline speed

- Its research requires Mechanical assembly and Electrical assembly and uses their crafted parts. Both branches follow Material recovery, which follows Improvised tools. Factory electricity and an existing fabricator are not required.
- After research, the player hand-assembles the MiniFab using plates, wire, mechanical and electrical parts, separately from research payment. The initial 2 plates + 2 wire + 1 of each part recipe is a provisional playtest value.
- The baseline device requires no power, fuel or charge. It always progresses when a valid job has ingredients and output capacity, including at night or during power shortages.
- Basic items craft quickly enough to avoid frustration. More complex eligible items take substantially longer, making upgrades and factory production worthwhile. Exact durations remain provisional balance; initial recipe eligibility matches researched handcrafting.
- Upgrades use more refined materials, keeping the base component tree useful. Do not retrofit an energy requirement onto baseline crafting when a power upgrade is added.

### Initial capability and requested jobs

- Initially the MiniFab can execute only researched **handcraftable recipes**. It does not inherit the Basic/Medium/Advanced factory arity restrictions. Later researched and physically crafted upgrades can enable hazardous-material and liquid handling; no such process is available in the opening device.
- The player selects one final item type and requests a batch bounded by that item's configurable stack limit; this is not a queue of unrelated final products. For that assigned job, the device pulls the complete immediate operation's ingredients from uncommitted player inventory **just before starting**, after player commands. There is no manual-feed requirement or full-batch upfront reservation. This request-driven intake is part of the initial device, separate from later autonomous min/max replenishment.
- Plan missing unlocked, compatible precursors first, sharing/reusing existing intermediates and retaining legitimate batch surplus. Never bypass research, extract world resources or invoke random recycling/unsupported factory processes. Reject invalid, locked, cyclic or impossible recipe chains before spending. A valid requested job waits for the next complete ingredient set if stock is insufficient; preserve the target and resume when stock is available rather than partially ingesting an operation.
- Initial input capacity holds **one complete operation's required ingredients**, by type and quantity. Initial output capacity holds **one completed item**, or one complete output batch when a recipe produces several items. Input and output capacities can later be upgraded toward their items' full stack limits; these are buffer-capacity upgrades, not larger default opening buffers. The existing opening recipes each produce one item per operation.
- Reuse the output buffer directly as input to the next operation when its complete input set can be assembled from buffer contents and available inventory. Transfer atomically at operation start; do not create hidden intermediate storage, partially fund multiple operations, duplicate shared ingredients or double-count the transfer as production.
- Completed production enters the output buffer and is credited once at that commit. Delivery to inventory, direct precursor transfer, pickup and refunds are transfers, not additional production. Automatically deliver buffered output when bag space and handcraft capacity protection permit. If the output buffer is full and the completed output cannot fit in inventory, pause production and inform the player; retain all items and automatically resume when capacity returns. Never spill MiniFab output.
- To avoid capacity deadlock, the next operation may ingest its complete input set first **when doing so actually frees the bag capacity needed for held output**, then deliver the held output and start work. Validate that whole transition before spending; consuming part of a stack does not free a slot, and consuming already buffered ingredients does not free a bag slot. Output room made by direct precursor use also counts. Do not ingest inputs for an unrelated operation merely to hold more stock.
- Player actions retain priority. During active handcrafting, MiniFab inventory withdrawals/deliveries wait; work already supplied inside MiniFab may continue subject to its own output buffer capacity. Field Research can consume only uncommitted player stock and never the MiniFab's ingested inputs or output. Revalidate stock/capacity at each MiniFab operation, not only when the job is selected.
- Preserve requested target/batch, precursor plan, active recipe, input/output contents and capacities, work, blocked reasons and cancellation provenance as plain save-ready state. Closing the MiniFab panel does not cancel its job.

### Cancellation and retained buffers

- Explicitly cancelling removes the remaining job request and discards the unfinished operation's partial work. Its original ingredients remain intact; do not turn unfinished ingredients into scrap or manufacture partial output. Completed products and their production history remain completed.
- Return cancelled inputs/completed output to player inventory when room is available. Otherwise the corresponding buffers retain them until space becomes available, without spilling or destroying items. Handcraft capacity protection and player priority still apply; automatic return cannot take protected space.
- While cancellation residue remains, allow a replacement recipe only if its **input material types match** the cancelled recipe; quantities may differ. Require the full new operation's ingredients and capacity, without deleting leftover quantities or increasing buffer limits.
- A different compatible recipe cannot begin production until the old output buffer is cleared. The **exact same recipe** as the cancelled one may start before clearing it only if the output buffer has room for another complete result. An empty output buffer clears this output restriction; emptying all retained buffers clears the cancellation-specific recipe restriction.
- Refund, delivery and cancellation commands must be idempotent. Preserve cancelled recipe/input-type identity and buffer contents across save/load so a reload cannot bypass restrictions, restore discarded partial work or return items twice.

MiniFab queue/buffer/recovery behavior design is complete. Concrete buffer-upgrade costs/tiers and future multi-output recipe rounding belong to their content slices. Advanced field-use recipes and liquid handling are later design work; winding/charge design is also complete; gameplay implementation is next when authorized.

### Optional winding and local charge

Agreed 28 October 2026:

- The optional local battery gives **2x MiniFab crafting speed while charged**, automatically falling back to the useful power-free 1x baseline when empty. A full initial battery supplies **60 seconds of active boosted crafting**, equivalent to 120 seconds of baseline recipe work. Drain charge only for the time actually spent processing a MiniFab operation: idle, manual/simulation pause, missing inputs, blocked output and waiting for inventory access consume nothing. Do not spend charge on intake, delivery or winding alone. Split a simulation step at charge expiry or job completion so the remaining time uses the correct speed without excess drain or lost work.
- Initially **five crank-equivalent rotations fill an empty battery** when no work is draining it. Charge accrues continuously from actual handle angular travel, not only after a complete revolution. Clockwise, counterclockwise and genuine back-and-forth movement all count positively. A turn is 360 degrees of accumulated absolute travel; a half-turn out and half-turn back earns one turn-equivalent even though the handle returns to its starting orientation.
- Show a handle rotating around a fixed pivot in the MiniFab panel. With a pointer, grab and drag the handle around that pivot; a click or stationary hold earns no charge. Keep the handle's visual angle aligned with the accepted pointer direction while grabbed.
- With a controller, select/focus the handle and rotate the right stick. The handle matches the stick's direction outside its centre deadzone; one stick revolution is one crank-equivalent. Returning the stick to centre or ending ownership earns no angular jump. Winding must not also orbit the camera or move the player.
- With keyboard/remappable controls, focus/select the handle and use directional keys to move its angle: **Up -> Right -> Down -> Left -> Up** is one crank-equivalent. Partial/reversed paths earn the angular distance the handle actually travels. A held/repeated key that leaves the handle at the same direction generates no new charge. Keyboard and pointer/stick use the same angular-to-charge conversion and capacity limits.
- Filter device noise, near-pivot/centre ambiguity, discontinuous pointer jumps and stale input, without banning deliberate small reversals. Apply a configurable reasonable angular charging limit consistently across adapters; exact sensitivity/deadzone/rate defaults are implementation/playtest tuning, not a new full-turn requirement. Credit accepted handle travel once, independently of renderer frame rate. Losing focus, release/selection changes or input ownership ends winding immediately; re-entry establishes a fresh angle rather than crediting the gap.
- **Gearing reduces recharge turns from five toward a minimum of one.** One-turn full recharge is fully upgraded gearing. Turns-to-full remains the same for any battery capacity at a given gearing tier: a larger battery earns more absolute charge per unit of handle travel. The exact intermediate gearing tier spacing/costs belong to later upgrade content; do not grant installed gearing from research alone.
- **Battery capacity has unlimited repeatable levels: +50% capacity per level, with upgrade cost doubling each level.** At capacity level n (base n=0), active boosted duration is 60 * 1.5^n seconds: 60, 90, 135, 202.5, ... . For the physical upgrade to level n>=1, cost is B * 2^(n-1), where B is the chosen first-upgrade material recipe; its catalogue quantities remain provisional. Research unlock, crafted upgrade payment and applying an owned upgrade remain distinct. Increasing capacity must not mint charge: retain the stored amount, not a free refill.
- Store charge as an amount of remaining active boosted time, bounded by current capacity. For accepted angular travel theta degrees and gearing T turns-to-full, earned charge is capacity * abs(theta) / (360 * T), capped at capacity. At the base 60-second/five-turn settings, one turn adds 12 boosted-work seconds. During charged processing, each active second consumes one stored second and performs two baseline seconds of recipe work. Simultaneous processing and winding still pays the processing drain; five turns describes charging without concurrent drain.
- Keep winding novel, optional and somewhat tedious with repetition, encouraging upgrades/automation without gating any recipe. Charge, capacity, gearing rank and crafting work are authoritative plain simulation state. Active gestures/device permissions are not saved; no stale-input or offline charging is replayed.
- Factory electricity, generators, grid/weather integration and powered-source stacking remain later systems. Accelerometer shaking and other unusual inputs are future opt-in capability experiments, not required opening or mobile features. Future power upgrades must preserve the always-available baseline.

Winding/charge behavior design and the opening's five design tasks are complete. Recipe times and the chosen first-upgrade material costs remain provisional playtest balance; later gearing tiers, repeatable-upgrade research staging and power-source combinations remain later content. The Milestone 3 gameplay implementation checklist is still open.

### Researched and crafted upgrades

Possible speed/power upgrades include onboard solar, onboard wind, coal and a grid connection. Coal's speed benefit carries a pollution cost. Onboard renewable behavior and grid integration join the related systems when they exist; none is a prerequisite for Milestone 3. Small-battery capacity/charging, input/output buffer capacity, hazardous/liquid handling and later autonomous inventory-driven replenishment are additional upgrade paths.

Every technology-based MiniFab upgrade follows this sequence:

1. Unlock Mini fabrication and the related general technology, such as solar power.
2. Research its separate MiniFab-specific upgrade, such as MiniFab solar.
3. Craft the actual upgrade using its material recipe before applying its effect.

General research does not directly upgrade the MiniFab, and completing the MiniFab-specific research only unlocks the upgrade recipe. Nothing is installed or accelerated for free. Exact upgrade costs, fitting/removal rules, coexistence of power sources and bonus stacking remain open. Grid connection is deferred until electricity is implemented; coal emissions must be accounted for when that upgrade arrives.

### Later advanced field-use role

Give upgraded MiniFab useful recipes while away from the main factory, rather than making it only an inferior factory substitute. A portable consumable requiring advanced fabrication, whose ingredients can be carried or acquired in the field, is a possible direction, not an approved item. Choose concrete roles/recipes when advanced crafting is designed; no artificial factory-only ban applies to safe handcraftable assemblies. Hazardous/liquid MiniFab capability still requires its own researched, crafted upgrade.

### Later automation upgrade

A later upgrade lets the player configure autonomous production targets when ingredients are in inventory, with configurable minimum/maximum input-consumption and output-production limits. The initial MiniFab already draws ingredients per operation for an explicitly requested job; this does not grant autonomous replenishment or min/max policies.

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

Agreed 28 October 2026:

- **Field Research runs in the background**, including while the player walks, salvages or handcrafts and while the research UI is closed. It advances on simulation time only; normal simulation pause/suspension stops it. Laboratories provide faster work, scalable throughput through more labs and later speed upgrades.
- Select one active technology for Field Research. The player can pause, disable or switch the active technology without losing that technology's consumed-material contributions or completed/partial work. Research has no cancel/reset/refund action: once consumed, a material is permanently invested in that technology and cannot be reclaimed or reassigned.
- While enabled, draw required materials **directly from uncommitted player inventory over time**, rather than collecting full payment or reserving the entire cost upfront. Revalidate current stock, prerequisites, historical eligibility and remaining demand at each consumption event. Never take an active craft's committed ingredients or supplied MiniFab/lab buffers as player stock.
- If materials needed for the next consumption event are unavailable, wait automatically without spending or granting unfunded work. Resume when available if Field Research is still enabled for that technology; missing stock does not switch the player's enable toggle off. Do not build up a backlog of unpaid work or burst-consume to catch up after a shortage.
- Disabling Field Research stops all research withdrawals from the player bag. Laboratories may continue using their own supplied inputs. When enabled, Field Research can contribute from player inventory alongside laboratory research against the same technology requirements; materials and work must not be paid or credited twice. Detailed lab buffer/routing/rate coordination belongs to later integration.
- Player commands and the current handcraft unit's input commitment take precedence over automatic research draws in a simulation step. The consume-only exception described in [inventory rules](#inventory-interaction-range-and-overflow) allows research during handcrafting without invalidating protected output/refund capacity. Other additions/transfers remain deferred; research can consume completed outputs still in the bag, so later batch units may lack stock.
- Persist the active technology, enabled/manual-pause choice, each technology's consumed-material counts and work progress, and the state needed to resume a material wait without duplicate payment. UI state does not enable/disable research. On load, resolve any unseen handcraft cancellation/refund before research draws or other inventory writers resume; no offline progress is implied.

Retain cumulative production eligibility and material payment as separate concepts. Completed crafting and machine output count toward production history; use separate extraction history for raw-resource eligibility. Consuming a research item advances its technology's contribution ledger exactly once without reducing lifetime history. Moving existing items, collecting output and dismantling refunds do not increase either history. Crafting newly unlocked equipment has a separate cost; research grants no free equipment.

Each paced research cycle consumes **one whole item of every material still required**, in parallel and atomically. If any still-required input is unavailable, the whole cycle waits: do not consume available ingredients separately. Stop charging a material once its total contribution is met. For a cost of 4 plates + 6 wire, four cycles consume 1 plate + 1 wire each, followed by two wire-only cycles; never spend beyond the listed totals. Revalidate the complete next bundle before consumption/work credit. Preserve partial cycle time on shortages, pause or switching, but never accrue unpaid catch-up work while waiting. Use the catalogue's nominal fully supplied work time across these cycles; numerical intervals remain provisional balance (initially total work seconds divided by the largest input quantity).

Field Research behavior design is complete. Total costs and nominal fully supplied work times remain the catalogue's provisional values. Shared lab coordination and later field capability limits are later research-integration decisions. Every genuinely completed craft adds production history, including re-crafting recovered material. Dismantling, refunds and transfers themselves never count; research still permanently consumes its inputs.

The proposed technology groups are material recovery, basic fabrication, renewable power, mixed recycling, extraction, sorting/logistics, industrial fabrication/research, storage, water treatment and greenhouse restoration. Coal/high-output polluting technologies and later pollution mitigation form optional branches. This is a dependency-planning outline, not a finalized catalog: audit that every research cost and required machine is obtainable through earlier unlocks.

## Resources and dismantling

Deposits are finite but very generous. Exhausting the initial resources should be unrealistic in ordinary play, requiring days of deliberate consumption. Encourage a player who lingers in the opening to progress rather than making depletion the normal pressure. The initial configurable playtest budget is 250,000 scrap across the starting deposits: about 69 hours at the opening prybar rate. Exact placement/distribution and the tone/timing of encouragement prompts are Milestone 3 authoring/balancing work; this is not a final whole-game resource budget.

Future world configuration should expose resource settings. Configurable world generation is a later feature; record configuration-ready balance values without adding its UI to the current prototype.

Dismantling completed crafted items/buildings recovers their full embodied **solid** material value in base resource form: scrap-origin ingredients return equivalent scrap, and non-scrap materials return the corresponding source ore and must be fully reprocessed. Liquids used to produce the item are lost. For mixed solids retain every resource family; do not collapse pure-ore materials into generic scrap or return refined parts for free. Detailed ore equivalents, origin tracking for alternate recipes and liquid handling are deferred until that content exists. The current opening contains only scrap-origin solids, so its existing scrap-equivalence ledger remains valid. Work-in-progress cancellation returns original ingredients intact; it is distinct from disassembling a finished item.

Disassembly is one atomic player action: calculate the complete body-material return plus intact input/output-buffer contents, accounting for any bag slot actually freed by removing the item. If the whole return cannot fit, report insufficient space and leave the item/device, active work and contents intact. Do not partially dismantle, cancel/refund its job early, spill recovery to the ground or erase contents. The action can succeed once sufficient room exists; revalidate at execution. On success, cancel unfinished MiniFab work with its settled original-input rule, recover buffered items once and return the completed device/item's embodied solid value. Research investment and histories are unchanged.

Use a material-origin/equivalence ledger across recipes, random recycling and recovery. No craft/dismantle loop may mint additional solid material value; recovering ore deliberately requires reprocessing. Completed re-crafts count as production, but dismantling and refunds add no history. Research-consumed materials remain an irreversible sink, with no cancellation/refund: investment/progress only moves forward and can be paused or switched. Liquid loss on disassembly is agreed at the concept level; exact liquid/fuel/water processes and later ore provenance remain future content work.

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

## Implementation readiness and later design work

The five Milestone 3 opening design tasks are complete. The final readiness review also settled automatic stock contention (requested MiniFab before Field Research, after manual actions) and atomic disassembly that waits for full inventory capacity. No further opening gameplay-design decision blocks implementation; this is design readiness, not authorization to resume gameplay work or evidence that it exists.

ECS is the selected architecture and its actual library/runtime foundation now precedes new core-loop implementation in [Milestone 3 Step 0](../plans/milestone-03-character-and-manual-opening.md#step-0-establish-and-prove-the-ecs-foundation). This is an engineering dependency, with the specific package still to evaluate; Milestone 6 extends it rather than migrating the opening. The gameplay decisions below remain settled.

For Milestone 3, deliver the five core technologies and six opening recipes, inventory/salvage/tool loop, background Field Research, handcrafting, player-requested MiniFab and its base crank/battery. Keep recipe costs/work times, 250,000 total starting scrap, placement and gesture sensitivity/rate defaults configurable for playtesting. The prototype pacing numbers are serial reference arithmetic, not required waits or measured results.

Keep later design work with its owning content slice:

- **Milestones 5–6:** laboratory coordination, dedicated research craftables, factory tier/cost selection, recycler probabilities/fairness and first machine recipes. Existing safe-handcraft and research-payment rules remain settled.
- **Later MiniFab upgrades:** actual gearing tiers, repeatable battery research staging/first-level material costs, buffer capacity, hazard/liquid modules, advanced portable recipes, fitting/removal, autonomous min/max targets and powered-source combinations. Their data can be accommodated now; they are not all Milestone 3 delivery requirements.
- **Advanced materials:** source-ore equivalents, alternate-recipe provenance, exact liquid-loss behavior and fuel/water consumables. The opening uses the existing scrap-only solid-value ledger. Re-crafting adds completed production; recovery/transfers do not.
- **Milestones 7–8:** first sorting/filter and overflow behavior, renewable curves/storage/Dunkelflaute parameters, greenhouse restoration/pollution rates and measurable small-map/world objectives. Preserve the peaceful coal-free path.

See the [Milestone 3 readiness and scope checklist](../plans/milestone-03-character-and-manual-opening.md#implementation-readiness-and-scope) for the implementation handoff. Record later changed decisions here without treating design or checklist completion as runtime evidence.
