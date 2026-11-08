import { isMachineKind, MACHINES, FACTORY_SETTINGS, RECYCLER_OUTCOMES } from '@content/factory';
import { canFabricate, EQUIPMENT_BLUEPRINTS } from '@content/first-factory';
import { OPENING_CONTENT, OPENING_RECIPES } from '@content/opening';
import type { ItemStack, SimulationSnapshot } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { footprintCells, worldToCell } from '@core/world-grid';

const record = (v: unknown, keys: readonly string[]): Record<string, unknown> => {
  check(
    !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null),
    'Invalid factory record',
  );
  check(
    Object.keys(v).every((k) => keys.includes(k)),
    'Unknown factory field',
  );
  return v as Record<string, unknown>;
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

const signature = (items: readonly ItemStack[]) =>
  JSON.stringify([...items].sort((a, b) => a.item.localeCompare(b.item)));

function stock(value: unknown, slots?: number): void {
  const items = slots === undefined ? value : record(value, ['slots'])['slots'];
  check(
    Array.isArray(items) && items.length <= 8 && (slots === undefined || items.length === slots),
    'Invalid factory buffer',
  );
  for (const value of items) {
    if (value === null && slots !== undefined) continue;
    const s = record(value, ['item', 'quantity']);
    check(
      typeof s['item'] === 'string' &&
        Object.hasOwn(OPENING_CONTENT.items, s['item']) &&
        Number.isSafeInteger(s['quantity']) &&
        Number(s['quantity']) > 0 &&
        (slots === undefined ||
          Number(s['quantity']) <= OPENING_CONTENT.items[s['item']].stackLimit),
      'Invalid factory stack',
    );
  }
}

/** Validate both structural captures and untrusted durable gameplay before rebuilding physics. */
export function assertFactorySnapshot(save: SimulationSnapshot): void {
  const machines = save.entities.filter((e) => e.machine);
  const byId = new Map(machines.map((e) => [e.id, e]));
  const claimed = new Set<string>();
  const unlocked = Object.keys(save.resources.research).filter(
    (id) => save.resources.research[id].unlocked,
  );
  const occupied = new Set<string>();
  if (machines.length)
    for (const e of [
      ...save.definition.blockers,
      ...save.entities.flatMap((e) => (e.building ? [e.building] : [])),
    ]) {
      const anchor = worldToCell(save.definition.grid, e.position);
      check(anchor, 'Factory outside grid');
      for (const cell of footprintCells(anchor, e.footprint, e.rotation)) {
        const key = `${cell.column},${cell.row}`;
        check(
          !occupied.has(key) &&
            save.definition.terrain[cell.row * save.definition.grid.columns + cell.column] !==
              'water',
          'Overlapping/invalid factory footprint',
        );
        occupied.add(key);
      }
    }
  for (const entity of save.entities) {
    if (entity.building?.buildingId !== undefined && entity.building.buildingId !== 'test-building')
      check(entity.machine, 'Missing machine component');
    if (!entity.machine) continue;
    const kind = entity.building?.buildingId;
    check(entity.kind === 'building' && isMachineKind(kind), 'Invalid machine owner');
    const building = entity.building!,
      machine = entity.machine;
    record(machine, [
      'enabled',
      'recipe',
      'deposit',
      'input',
      'output',
      'job',
      'random',
      'requested',
      'allocated',
      'status',
    ]);
    check(
      typeof machine.enabled === 'boolean' &&
        (machine.recipe === null || typeof machine.recipe === 'string') &&
        (machine.deposit === null || typeof machine.deposit === 'string'),
      'Invalid machine configuration',
    );
    check(
      building.footprint.width === 1 &&
        building.footprint.depth === 1 &&
        JSON.stringify(building.collision) ===
          JSON.stringify({ shape: 'box', width: 1.2, depth: 1.2, height: 1.5 }) &&
        JSON.stringify(entity.transform?.position) === JSON.stringify(building.position),
      'Invalid machine geometry',
    );
    stock(machine.input, MACHINES[kind].inputSlots);
    stock(machine.output, MACHINES[kind].outputSlots);
    check(
      finite(machine.requested) &&
        finite(machine.allocated) &&
        machine.requested <= MACHINES[kind].watts &&
        machine.allocated <= machine.requested + 1e-8 &&
        [
          'idle',
          'disabled',
          'missing-input',
          'no-power',
          'working',
          'blocked',
          'depleted',
        ].includes(machine.status),
      'Invalid machine power/status',
    );
    const random = record(machine.random, ['state', 'sequence', 'cursor']);
    check(
      Number.isSafeInteger(random['state']) &&
        Number(random['state']) > 0 &&
        Number(random['state']) <= 0xffffffff &&
        Array.isArray(random['sequence']) &&
        [0, RECYCLER_OUTCOMES.length].includes(random['sequence'].length) &&
        new Set(random['sequence']).size === random['sequence'].length &&
        random['sequence'].every(
          (n) => Number.isInteger(n) && n >= 0 && n < RECYCLER_OUTCOMES.length,
        ) &&
        Number.isSafeInteger(random['cursor']) &&
        Number(random['cursor']) >= 0 &&
        Number(random['cursor']) <= random['sequence'].length,
      'Invalid recycler sequence',
    );
    if (kind === 'extractor') {
      const deposit = save.entities.find((e) => e.id === machine.deposit && e.deposit);
      check(
        deposit &&
          !claimed.has(deposit.id) &&
          deposit.transform?.position.x === building.position.x &&
          deposit.transform.position.z === building.position.z,
        'Invalid/exclusive extractor claim',
      );
      claimed.add(deposit.id);
    } else check(machine.deposit === null, 'Unexpected deposit claim');
    const tier =
      kind === 'basic-fabricator' ? 'basic' : kind === 'medium-fabricator' ? 'medium' : null;
    const recipe = OPENING_RECIPES.find((r) => r.id === machine.recipe);
    if (machine.recipe !== null)
      check(tier && recipe && canFabricate(recipe, tier, unlocked), 'Invalid machine recipe');
    check(!!tier || machine.recipe === null, 'Unexpected machine recipe');
    check(
      machine.job === null || (!!machine.job && typeof machine.job === 'object'),
      'Missing factory job state',
    );
    if (!machine.job) continue;
    const job = machine.job;
    record(job, ['recipe', 'remaining', 'inputs', 'outputs', 'outputCommitted']);
    stock(job.inputs);
    stock(job.outputs);
    check(finite(job.remaining), 'Invalid machine work');
    check(
      typeof job.outputCommitted === 'boolean' &&
        job.outputCommitted === (kind !== 'extractor' && job.remaining === 0),
      'Invalid pending-output history marker',
    );
    if (kind === 'recycler') {
      check(
        job.recipe === 'recycle-scrap' &&
          job.remaining <= FACTORY_SETTINGS.recyclerSeconds &&
          signature(job.inputs) ===
            signature([{ item: 'scrap', quantity: FACTORY_SETTINGS.recyclerInput }]) &&
          machine.random.cursor > 0 &&
          signature(job.outputs) ===
            signature(RECYCLER_OUTCOMES[machine.random.sequence[machine.random.cursor - 1]]),
        'Invalid recycler job',
      );
    } else if (kind === 'extractor') {
      check(
        job.recipe === 'extract-scrap' &&
          job.remaining <= FACTORY_SETTINGS.extractionSeconds &&
          job.inputs.length === 0 &&
          job.outputs.length === 1 &&
          job.outputs[0].item === 'scrap' &&
          job.outputs[0].quantity <= FACTORY_SETTINGS.extractionQuantity,
        'Invalid extraction job',
      );
    } else
      check(
        tier &&
          recipe &&
          job.recipe === recipe.id &&
          job.remaining <= recipe.seconds &&
          signature(job.inputs) === signature(recipe.inputs) &&
          signature(job.outputs) === signature(recipe.outputs),
        'Invalid fabrication job',
      );
  }
  if (!save.resources.factory) {
    check(!machines.length, 'Missing factory resources');
    return;
  }
  record(save.resources.factory, ['connections']);
  const edges = save.resources.factory.connections;
  check(Array.isArray(edges) && edges.length <= 250000, 'Invalid power graph');
  const ids = new Set(save.entities.map((e) => e.id)),
    pairs = new Set<string>();
  for (const edge of edges) {
    record(edge, ['id', 'from', 'to']);
    check(
      typeof edge.id === 'string' &&
        edge.id.length > 0 &&
        edge.id.length <= 256 &&
        !ids.has(edge.id),
      'Invalid connection ID',
    );
    ids.add(edge.id);
    const a = byId.get(edge.from),
      b = byId.get(edge.to);
    const pair = JSON.stringify([edge.from, edge.to].sort());
    check(a && b && a !== b && !pairs.has(pair), 'Invalid/duplicate power endpoints');
    pairs.add(pair);
    check(
      Math.hypot(
        a.building!.position.x - b.building!.position.x,
        a.building!.position.z - b.building!.position.z,
      ) <= FACTORY_SETTINGS.cableReach,
      'Power connection exceeds reach',
    );
  }
}

export function assertFactoryResearch(save: SimulationSnapshot): void {
  for (const e of save.entities.filter((e) => e.machine)) {
    const blueprint = EQUIPMENT_BLUEPRINTS.find((b) => b.id === e.building!.buildingId)!;
    check(save.resources.research[blueprint.technology]?.unlocked, 'Unresearched saved equipment');
  }
  if (save.resources.factory?.connections.length)
    check(save.resources.research['electrical-engineering']?.unlocked, 'Unresearched saved wiring');
}
