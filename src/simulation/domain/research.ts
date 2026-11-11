import { OPENING_CONTENT, OPENING_TECHNOLOGIES, type OpeningTechnology } from '@content/opening';
import type { InventoryData, WorldResources } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { available, transact } from './inventory';
import { researchPrerequisitesMet } from '@core/research-prerequisites';

export type ResearchLedgers = WorldResources['research'];

export interface ResearchSource {
  readonly id: string;
  readonly kind: 'field' | 'lab';
  readonly inventory: InventoryData;
  /** Fully supplied work seconds per simulation second; omit disabled/unpowered sources. */
  readonly rate: number;
  /** Ordered simulation accounting hook; reports accepted work, never attempted budget. */
  readonly onWork?: (seconds: number) => void;
}

export function researchReady(
  technology: OpeningTechnology,
  ledgers: ResearchLedgers,
  history: (item: string) => number,
): boolean {
  return (
    researchPrerequisitesMet(technology, ledgers) &&
    technology.eligibility.every((cost) => history(cost.item) >= cost.quantity)
  );
}

/** One shared ledger, one current technology, atomic source-local payment at each paced cycle.
 * Partial cycle work belongs to the technology, not a worker or its queue entry. No inputs are
 * reserved up front: a source must have the entire next bundle throughout each accepted draw.
 * Supplied labs run in stable ID order, then field work. Completing the head stops this step;
 * unused source time never spills into a second technology or accumulates unpaid catch-up.
 */
export function advanceResearch(
  queue: string[],
  ledgers: ResearchLedgers,
  sources: readonly ResearchSource[],
  history: (item: string) => number,
  delta: number,
  technologies = OPENING_TECHNOLOGIES,
): string | null {
  check(Number.isFinite(delta) && delta >= 0, 'Invalid research delta');
  check(
    new Set(sources.map((source) => source.id)).size === sources.length &&
      new Set(sources.map((source) => source.inventory)).size === sources.length &&
      sources.filter((source) => source.kind === 'field').length <= 1 &&
      sources.every(
        (source) => source.id.length > 0 && Number.isFinite(source.rate) && source.rate > 0,
      ),
    'Invalid research sources',
  );
  if (!delta || !queue.length) return null;
  const technology = technologies.find((entry) => entry.id === queue[0]);
  if (
    !technology ||
    ledgers[technology.id]?.unlocked ||
    !researchReady(technology, ledgers, history)
  )
    return null;
  const workers = [...sources].sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'lab' ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  for (const source of workers) {
    let budget = delta * source.rate;
    while (budget > 1e-10) {
      const ledger = ledgers[technology.id] ?? { consumed: {}, work: 0, unlocked: false };
      const bundle = technology.costs
        .filter((cost) => (ledger.consumed[cost.item] ?? 0) < cost.quantity)
        .map((cost) => ({ item: cost.item, quantity: 1 }));
      if (
        !bundle.length ||
        !bundle.every((cost) => available(source.inventory, cost.item) >= cost.quantity)
      )
        break;
      const cycles = Math.max(...technology.costs.map((cost) => cost.quantity));
      const paid = Math.max(0, ...Object.values(ledger.consumed));
      const boundary = Math.min(technology.seconds, ((paid + 1) * technology.seconds) / cycles);
      const work = Math.min(budget, Math.max(0, boundary - ledger.work));
      ledgers[technology.id] = ledger;
      ledger.work = Math.min(boundary, ledger.work + work);
      source.onWork?.(work);
      budget -= work;
      if (ledger.work + 1e-9 < boundary) break;
      if (!transact(source.inventory, bundle, [], OPENING_CONTENT)) break;
      for (const cost of bundle) ledger.consumed[cost.item] = (ledger.consumed[cost.item] ?? 0) + 1;
      if (technology.costs.every((cost) => ledger.consumed[cost.item] >= cost.quantity)) {
        ledger.work = technology.seconds;
        ledger.unlocked = true;
        queue.shift();
        return technology.id;
      }
    }
  }
  return null;
}
