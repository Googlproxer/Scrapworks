import type { SimulationSnapshot } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { OPENING_CONTENT, OPENING_RECIPES, OPENING_TECHNOLOGIES } from '@content/opening';
import { assertSnapshot } from './capture';
import { upgradeOpeningSave } from './legacy-opening-save';
import { assertFactoryResearch } from './factory-capture';
import { emptyToolbar } from '@contracts/toolbar';
import { sameData } from '@core/data-equality';
import { researchPrerequisitesMet } from '@core/research-prerequisites';

/** Additional invariants for untrusted durable saves; internal laboratory captures remain separate. */
export function preparePlayerSave(value: unknown): SimulationSnapshot {
  const candidate = upgradeOpeningSave(value);
  assertSnapshot(candidate, OPENING_CONTENT);
  const save = candidate;
  const player = save.entities.find((entity) => entity.id === save.resources.playerId)!;
  const opening = player.opening!;
  const grid = save.definition.grid;
  const ids = new Set(save.entities.map((entity) => entity.id));
  const jobs = new Set<string>();
  check(
    save.resources.nextEntityId >= 1 && save.resources.nextEntityId < Number.MAX_SAFE_INTEGER - 256,
    'Unsafe saved ID counter.',
  );
  check(
    Object.keys(save.resources).every((key) =>
      [
        'worldId',
        'playerId',
        'tick',
        'stepSeconds',
        'nextEntityId',
        'research',
        'productionTotals',
        'extractionTotals',
        'factory',
        'environment',
      ].includes(key),
    ),
    'Unknown saved world resource.',
  );
  for (const entity of save.entities) {
    const allowed = [
      'id',
      'kind',
      'transform',
      ...(entity.kind === 'player'
        ? ['inventory', 'equipment', 'opening']
        : [
            entity.kind === 'body' ? 'physics' : entity.kind,
            ...(entity.kind === 'building' ? ['machine', 'transport'] : []),
          ]),
    ];
    check(
      Object.keys(entity).every((key) => allowed.includes(key)),
      'Invalid saved component ownership.',
    );
    const p = entity.transform?.position;
    check(
      p &&
        p.x >= grid.origin.x &&
        p.x < grid.origin.x + grid.columns * grid.metresPerCell &&
        p.z >= grid.origin.z &&
        p.z < grid.origin.z + grid.rows * grid.metresPerCell &&
        p.y >= 0 &&
        p.y <= 100,
      'Saved entity is outside world bounds.',
    );
    if (entity.deposit) {
      const original = save.definition.deposits.find((deposit) => deposit.id === entity.id);
      check(
        original &&
          entity.deposit.kind === original.kind &&
          entity.deposit.quantity <= original.quantity &&
          sameData(original.position, p),
        'Invalid saved deposit.',
      );
    }
    if (entity.kind === 'building')
      check(
        (entity.machine || entity.transport) && entity.building?.buildingId !== 'test-building',
        'Developer fixture buildings are not supported in player saves.',
      );
  }
  check(
    save.definition.deposits.every((deposit) =>
      save.entities.some((entity) => entity.id === deposit.id && entity.kind === 'deposit'),
    ),
    'Missing saved deposit.',
  );
  for (const [key, total] of Object.entries(save.resources.productionTotals))
    check(
      (key === 'minifab' || Object.hasOwn(OPENING_CONTENT.items, key)) &&
        Number.isSafeInteger(total),
      'Unknown production history item.',
    );
  for (const key of Object.keys(save.resources.extractionTotals))
    check(key === 'scrap' || key === 'coal', 'Unknown extraction history item.');
  const research = save.resources.research;
  assertFactoryResearch(save);
  for (const [id, ledger] of Object.entries(research)) {
    const technology = OPENING_TECHNOLOGIES.find((entry) => entry.id === id)!;
    check(
      Object.keys(ledger).every((key) => ['consumed', 'work', 'unlocked'].includes(key)),
      'Unknown research field.',
    );
    check(
      ledger.work <= technology.seconds &&
        Object.entries(ledger.consumed).every(
          ([item, count]) =>
            count <= (technology.costs.find((cost) => cost.item === item)?.quantity ?? -1),
        ),
      'Invalid saved research contribution.',
    );
    const paid = Math.max(0, ...Object.values(ledger.consumed));
    check(
      technology.costs.every(
        (cost) => (ledger.consumed[cost.item] ?? 0) === Math.min(paid, cost.quantity),
      ),
      'Unsynchronized research contributions.',
    );
    const cycles = Math.max(...technology.costs.map((cost) => cost.quantity));
    check(
      ledger.work + 1e-8 >= (paid * technology.seconds) / cycles &&
        ledger.work <=
          Math.min(technology.seconds, ((paid + 1) * technology.seconds) / cycles) + 1e-8,
      'Invalid saved research work.',
    );
    if (paid || ledger.work || ledger.unlocked)
      check(
        technology.requires.every((id) => research[id]?.unlocked),
        'Missing research prerequisite.',
      );
    if (ledger.unlocked)
      check(
        ledger.work === technology.seconds &&
          technology.costs.every((cost) => ledger.consumed[cost.item] === cost.quantity),
        'Unpaid research unlock.',
      );
  }

  const unlocked = (recipe: string) =>
    !!research[OPENING_RECIPES.find((entry) => entry.id === recipe)!.technology]?.unlocked;

  if (player.equipment!.tool !== null)
    check(
      player.equipment!.tool === 'prybar' && research['improvised-tools']?.unlocked,
      'Invalid equipped tool.',
    );
  check(
    opening.researchQueue.every((id) => !research[id]?.unlocked),
    'Completed technology in research queue.',
  );
  for (const job of [opening.handcraft, opening.minifab.job])
    if (job) {
      check(
        !ids.has(job.id) && !jobs.has(job.id) && unlocked(job.recipe),
        'Invalid saved job identity or recipe.',
      );
      jobs.add(job.id);
    }
  for (const id of [
    ...ids,
    ...jobs,
    ...(save.resources.factory?.connections.map((c) => c.id) ?? []),
    ...(save.resources.factory?.transport?.connections.map((c) => c.id) ?? []),
    ...(save.resources.environment?.connections.map((c) => c.id) ?? []),
  ]) {
    const suffix = /^(?:pile|building|opening-job|connection|material|fluid)[-:](\d+)$/.exec(id);
    if (suffix)
      check(
        Number.isSafeInteger(Number(suffix[1])) && Number(suffix[1]) < save.resources.nextEntityId,
        'Unsafe saved ID counter.',
      );
  }
  if (opening.salvage)
    check(
      save.entities.some(
        (entity) => entity.id === opening.salvage!.target && entity.kind === 'deposit',
      ),
      'Missing salvage target.',
    );
  if (opening.minifab.owned) check(research['mini-fabrication']?.unlocked, 'Unresearched MiniFab.');
  if (opening.minifab.request)
    check(unlocked(opening.minifab.request.recipe), 'Locked MiniFab request.');
  if (opening.minifab.outputRecipe)
    check(unlocked(opening.minifab.outputRecipe), 'Locked MiniFab output.');
  const copy = structuredClone(save),
    owner = copy.entities.find((entity) => entity.id === copy.resources.playerId)!;
  owner.opening!.toolbar ??= emptyToolbar();
  // Normalize only after validating the entire save; malformed queues must still be rejected.
  owner.opening!.researchQueue = owner.opening!.researchQueue.filter((id) =>
    researchPrerequisitesMet(
      OPENING_TECHNOLOGIES.find((technology) => technology.id === id)!,
      copy.resources.research,
    ),
  );
  owner.transform!.moving = owner.transform!.sprinting = false;
  owner.opening!.salvage = null;
  owner.opening!.handcraftVisible = !!owner.opening!.handcraft;
  owner.opening!.handcraftSuspended = false;
  return copy;
}
