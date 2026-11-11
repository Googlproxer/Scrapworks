import type { WorldView } from '@contracts/world';

export const GUIDE_STEPS = [
  [
    'movement',
    'Find your footing',
    'Move with your movement controls. Approach the scrap deposit; salvage works within two metres.',
  ],
  [
    'tools',
    'Research your first tool',
    'Collect four scrap, then queue Improvised tools in Research. Gather more while field work runs. Research unlocks the recipe; handcraft a scrap prybar to equip it.',
  ],
  [
    'materials',
    'Recover useful materials',
    'Research Material recovery, then Mechanical and Electrical assembly. Handcraft plates, wire and both parts. Research payments consume stock; keep materials for the equipment itself.',
  ],
  [
    'minifab',
    'Build your Mini Fabricator',
    'Research Mini fabrication, then hand-assemble the MiniFab from plates, wire and both parts. Request a final item in Inventory & Crafting; compatible precursors are made for you. It works without power while you explore.',
  ],
  [
    'industry',
    'Build a renewable workshop',
    'Research solar/wind power, recycling, fabrication and laboratories. Craft the equipment, assign it under Equipable, choose its toolbar slot and press B to build. Connect crafted power cables with two clicks; click the first endpoint again to cancel. Interact with a nearby machine using E / click to configure it and transfer materials.',
  ],
  [
    'transport',
    'Connect your production',
    'Research Sorting and conveyors. Build extraction, conveyors and a sorter; interact with equipment to connect facing neighbouring ports. Route plates, wire and returned scrap separately. Transport needs no power; a blocked destination keeps its items.',
  ],
  [
    'water',
    'Bring water to the land',
    'Research Energy storage and Water treatment, then Greenhouse restoration. Place a pump at the lake edge, treatment and a tank. Interact with utility machines to connect facing water ports, then supply powered greenhouses with clean water.',
  ],
  [
    'restoration',
    'Restore every land and water cell',
    'Supply greenhouses with clean piped water and renewable power. Health persists and spreads as nearby cells fill. Inspect health and weather in Factory. Batteries cover shortages; coal is optional. Restore all 400 cells to 100%; there is no game over.',
  ],
  [
    'complete',
    'Restoration checkpoint complete',
    'Every land and water cell reached full health. Keep playing: experiment with optional coal and mitigation, recover from pollution, or refine the factory. Completion stays earned even if health later falls.',
  ],
] as const;

/** View-derived guidance only. No tutorial flags, payments or gameplay authority. */
export function guideStep(world: WorldView | null): (typeof GUIDE_STEPS)[number] {
  const opening = world?.opening;
  if (!world || !opening) return GUIDE_STEPS[0];

  const unlocked = (id: string) => !!opening.ledgers[id]?.unlocked;

  const has = (id: string) => world.buildings.some((b) => b.buildingId === id);

  if (world.factory?.environment?.completed) return GUIDE_STEPS[8];
  if (unlocked('greenhouse') || has('greenhouse')) return GUIDE_STEPS[7];
  if (unlocked('water-treatment') || unlocked('storage') || has('water-pump'))
    return GUIDE_STEPS[6];
  if (unlocked('sorting-logistics') || has('conveyor') || has('sorter')) return GUIDE_STEPS[6];
  if (unlocked('laboratory-research') || has('laboratory')) return GUIDE_STEPS[5];
  if (opening.state.minifab.owned || world.buildings.length) return GUIDE_STEPS[4];
  if (unlocked('mini-fabrication')) return GUIDE_STEPS[3];
  if (unlocked('mechanical-assembly') && unlocked('electrical-assembly')) return GUIDE_STEPS[3];
  if (unlocked('material-recovery')) return GUIDE_STEPS[2];
  if (unlocked('improvised-tools') && opening.tool) return GUIDE_STEPS[2];
  if (opening.state.moved || (opening.extracted['scrap'] ?? 0) > 0) return GUIDE_STEPS[1];
  return GUIDE_STEPS[0];
}

export const FIELD_MANUAL = [
  {
    title: 'Move, salvage and build',
    text: 'WASD / left stick moves; Shift / stick press sprints. Right drag / right stick orbits. Approach scrap within two metres; hold F or toggle G to salvage. E / click inspects nearby machines and picks up ground items. Tab opens the field kit. Assign crafted placeables under Equipable, select 1–8, B builds and R rotates. Use Controls to review or rebind your inputs.',
  },
  {
    title: 'Crafting and the MiniFab',
    text: 'Handcrafting requires its panel to stay open. Leaving asks before cancelling unfinished work: completed items remain and the unfinished unit returns its original inputs. Research grants recipes, not free equipment. The MiniFab uses bag stock for requested precursors and keeps one-operation buffers. Collect output or clear retained inputs when full. Winding with the pointer, arrow keys or right stick gives an optional local boost; empty charge never stops baseline crafting.',
  },
  {
    title: 'Research payments and shared work',
    text: 'Historical extraction/production totals establish eligibility; they are not spendable materials. Field Research pays from available bag stock; labs pay from their own input buffers. Contributed materials are spent permanently. Field work and powered, supplied labs advance one shared queue. Field Research starts enabled. Queue only technologies whose prerequisites are researched; yellow means those prerequisites are met even when inputs are missing. Reordering/removing a technology retains its payments and partial work; queue it again to resume.',
  },
  {
    title: 'Machine and transport recovery',
    text: 'Interact with a machine within two metres to open its controls; Factory shows global statistics. Missing input: load the selected recipe’s materials. No power: connect a generator and check supply/demand. Blocked: collect output or make room downstream. Disabled: enable the machine. Idle: choose a researched recipe supported by its input count. Depleted: use another deposit. Facing adjacent ports are required for materials/water. Sorter filters are strict: matched stock waits for its own destination while other routes continue within their capacity. Dismantling returns solid value and unconsumed infrastructure water to its sources.',
  },
  {
    title: 'Water, weather and peaceful restoration',
    text: 'Solar varies with daylight; rain lowers solar and raises wind. A Dunkelflaute reduces both. Batteries store surplus and shortages slow or pause work safely. Coal starts/stops slowly, needs fuel and water, and causes local emissions; untreated water increases them. Clean water, greenhouses and mitigation can recover polluted land and water. Restore every cell to 100% once, then keep playing. No shortage or pollution ends the game or permanently locks research.',
  },
  {
    title: 'Pause, save, recover and transfer',
    text: 'Menu pauses; hidden games do not advance and there is no offline production. Autosaves commit every two active minutes, retaining five auto and three manual revisions per run. An in-flight write is not yet saved. Use recovery to select a valid older revision; loading alone does not overwrite history. Validate/import a backup as a distinct run, then activate it deliberately. Download current progress works even when browser storage fails. Each browser profile and hosting origin owns separate saves; export JSON to transfer or protect against cleared site data.',
  },
] as const;
