# Scrapworks Game Design Document

Updated 2 October 2026.

Scrapworks is a web game about building an automated factory to restore a dead planet. The player balances industrial progress with the environmental impact of the machinery that enables it. This document records the agreed gameplay direction and proposed first playable milestone. Architecture, technology choices, state management, and persistence are covered in the [Technical Design Document](TDD.md). Visual direction and character asset specifications are covered in the [Art Document](../art/README.md).

## Agreed gameplay direction

- Factory building and automation are the main appeal, drawing on the player's enjoyment of Factorio and Satisfactory.
- The setting is a damaged planet that the player gradually restores.
- Energy choices affect restoration. Coal offers substantial power, but its environmental impact makes restoration harder.
- The early prototype uses direct character control for exploration and construction.
- The player starts with an empty inventory and no supplied tools, equipment, buildings, or researched technologies. Manual mining or salvaging and crafting basic materials from scrap are starting abilities.
- Early progress requires collecting scrap by hand and manually crafting it into basic materials.
- Technologies must be researched before their equipment can be crafted or built. The starting manual abilities provide the recipes needed to begin this progression.
- Research eligibility requires producing specified quantities of the inputs for a technology, counted cumulatively within the saved world. Research also consumes those quantities from available materials. Production totals remain intact after spending. There are no science packs.
- The prototype saves and loads progress locally in the browser. Accounts and cloud saves are future possibilities.
- Remote control is a future possibility as the factory expands. It is outside the early prototype scope.

## Proposed first playable milestone

Use a small map containing scrap deposits, a coal supply, water, and a ruined greenhouse. These are features of the world, not starting possessions. The player first collects scrap and crafts materials manually, then earns access to machinery through research.

The proposed loop is: collect scrap, handcraft basic materials, meet production requirements, research equipment, craft and place it, automate supply, restore the greenhouse, and improve the factory so it can sustain that restoration.

The first milestone should introduce a coal generator, recycler, conveyors, solar panels, water purifier, and greenhouse restoration through a small research tree. The player must earn and craft the equipment. Simple power connections can keep the focus on production and environmental decisions. Include a basic way to store solar energy or water so the player can plan for nighttime operation. Exact recipes, capacities, and timings remain to be designed.

The proposed goal is to keep the greenhouse healthy through a complete day and night while the factory continues producing. The player should be able to compare a fast coal-powered approach with a cleaner approach that takes more planning and infrastructure.

## Proposed opening progression

1. Manually salvage scrap from a nearby deposit.
2. Handcraft metal plates and wire using the starting recipes.
3. Produce enough of those materials to qualify for basic power research.
4. Research and craft a coal generator, then manually collect its fuel.
5. Research and build a recycler, then conveyors, to automate the work previously done by hand.
6. Unlock water treatment, cleaner power, and greenhouse restoration as production develops.

Every technology's requirements must be obtainable using starting abilities or previously unlocked recipes. Basic power must be reachable before progress depends on the powered recycler. Handcrafting should establish the value of automation without requiring a long opening grind.

## Energy and environmental restoration

Coal should provide useful early progress. Its pollution should have visible, understandable consequences for the greenhouse, such as slower growth or greater water purification demand. Solar power should offer a cleaner alternative with space and nighttime constraints. The player should be able to recover damaged land and improve an inefficient layout.

Use one understandable pollution model for the prototype. Show its relationship to industrial activity and greenhouse health through an overlay and visible changes to vegetation. More detailed soil, air, and water systems can follow only if the core interaction proves enjoyable.

## Research progression

Each technology lists the inputs the player must have produced and the required quantity of each. Research requires both meeting the cumulative production milestones and having those quantities available to spend. Research consumes the materials and unlocks the associated crafting and construction recipes. Inventory possession alone does not establish that the player has produced an item.

Count cumulative production within the saved world. The proposed counting details include both completed manual crafts and machine output, with production before a technology becomes visible still counting. Moving items between inventories, collecting existing machine output, or receiving dismantling refunds must not count the same production again. Completed research and production totals survive saving and loading.

Research consumes its listed input quantities. Crafting equipment then consumes that equipment's recipe ingredients separately. Several technologies can refer to the same cumulative production history, but each research unlock needs its own material payment. Researching one technology does not reset production totals. If a production milestone has been met but the materials have already been spent elsewhere, the player must replenish the required stock before researching.

For illustration only, basic power might require producing and spending 20 metal plates and 10 wire. Crafting a generator could then cost another 8 plates and 4 wire. If the player handcrafts 28 plates and 14 wire, research leaves 8 plates and 4 wire for the generator. Crafting it uses the remaining materials; production history still records 28 plates and 14 wire. These quantities and recipe names are examples, not agreed balance values. Balance the opening around the combined research and construction cost so the player reaches their first useful machine without a long manual grind.

The proposed prototype uses an immediate Research action once production requirements, material costs, and any prerequisite technologies are met. Separate research stations and research timers are outside this initial proposal. For each required input, the interface should show cumulative production and stock available to spend separately, alongside the unlocks and any unmet prerequisite. For example, Produced 28/20 plates and Available 8/20 plates means the milestone is complete but the research cannot yet be paid for. Equipment crafting costs should appear separately from research costs.

## Character interaction proposal

Keyboard movement and mouse placement remain the starting control proposal. Construction happens within reach of the character, encouraging the player to explore the map and walk through their factory. Building previews should show placement validity and machine orientation. The camera and character appearance are specified in the [Art Document](../art/README.md).

## Saving and session behaviour

Local saving and loading are agreed for the prototype. Manual save slots, periodic autosaves with a retained previous save, and file export and import are proposed features. Their implementation is described in the [Technical Design Document](TDD.md).

The proposed prototype pauses when the game is hidden or closed and resumes from the saved simulation time, without offline production.

## Prototype scope and later possibilities

Keep the prototype focused on movement, manual collection and crafting, a small research tree, construction, resource transport, power, and restoration. Combat, character survival, multiplayer, and a large research tree are outside the proposed first milestone.

Remote construction or control could become an earned capability once the factory grows beyond comfortable walking distance. Possible forms include drones or a control terminal; no implementation is selected yet.

Other expansion ideas include filtration, efficiency upgrades, pollution spreading between regions, and restored ecosystems supplying new resources. These are future design options rather than prototype requirements. Accounts and cloud saves are also deferred.

## Prototype success criteria

- Building a working production line feels satisfying.
- The player can progress from an empty inventory to the first working machines using only the starting manual abilities.
- Production milestones and material costs clearly explain how to unlock a technology, and locked equipment cannot be crafted or built.
- Research consumes the required stock exactly once while preserving cumulative production totals.
- The player understands why pollution changes restoration progress.
- Coal and cleaner energy create meaningful decisions with visible consequences.
- The player can improve the system and see the landscape recover.
- Character movement makes exploring and building enjoyable on the small map.
