import { OPENING_RECIPES, OPENING_TECHNOLOGIES } from '@content/opening';
import type { SessionEvent } from '@contracts/session-event';
import type { WorldView } from '@contracts/world';
import type { NotificationCenter } from './notifications';
import { minifabStatus } from './opening-labels';

const rejections: Readonly<Record<string, string>> = {
  'out-of-reach': 'Move within two metres of the target.',
  depleted: 'This deposit is empty.',
  capacity:
    'Make room for the complete result or material return. Retained MiniFab buffers may need clearing.',
  'missing-input': 'Collect or craft the required materials first.',
  locked: 'Complete the required research first.',
  busy: 'Finish or cancel the current work before starting this action.',
  'invalid-request': 'Choose an available recipe and a batch within its stack limit.',
};

/** Outcome delivery is independent of how many steps fit in one publication. */
export class OpeningFeedback {
  private researchWait = '';
  private miniWait = '';
  private worldId = '';

  public constructor(private readonly notifications: NotificationCenter) {}

  public handle({ event }: SessionEvent): void {
    switch (event.kind) {
      case 'command-result': {
        const result = event.acknowledgement.result;
        if (result !== 'cancelled' && !result.accepted)
          this.notifications.open({
            key: `opening-rejection:${result.reason}`,
            title: 'Action unavailable',
            message: rejections[result.reason ?? ''] ?? 'The action is unavailable here.',
            tone: 'warning',
          });
        break;
      }
      case 'research-completed':
        this.notifications.open({
          title: 'Research complete',
          message: `${OPENING_TECHNOLOGIES.find((technology) => technology.id === event.technology)?.name ?? event.technology} researched. Its recipes are now available.`,
          tone: 'success',
        });
        break;
      case 'handcraft-ended':
        this.notifications.open({
          key: event.reason === 'stock-or-space' ? 'opening-attention' : undefined,
          title: 'Field kit',
          message:
            event.reason === 'cancelled'
              ? 'Handcrafting cancelled. Completed items remain; unfinished ingredients returned.'
              : event.reason === 'stock-or-space'
                ? 'Batch stopped: the next unit needs materials or space.'
                : `${OPENING_RECIPES.find((recipe) => recipe.id === event.recipe)?.name ?? event.recipe} completed.`,
          tone: event.reason === 'stock-or-space' ? 'warning' : 'success',
        });
        break;
      case 'salvage-attention':
        this.notifications.open({
          key: 'opening-attention',
          title: 'Materials and capacity',
          message:
            event.reason === 'bag-full'
              ? 'Bag full. Salvaged resources are on the ground; pick them up when there is room.'
              : 'Salvage stopped: move within two metres of a deposit with resources remaining.',
          tone: 'warning',
        });
        break;
      case 'materials-recovered':
        this.notifications.open({
          title: 'Field kit',
          message: 'Recovered materials. Research and earned history are preserved.',
          tone: 'success',
        });
        break;
      case 'minifab-status':
        if (event.status === 'completed')
          this.notifications.open({
            title: 'MiniFab',
            message: 'Request completed.',
            tone: 'success',
          });
        break;
    }
  }

  public update(world: WorldView | null): void {
    const opening = world?.opening;
    if (!world || !opening) return;
    const identity = `${world.worldId}:${world.worldGeneration ?? 0}`;
    if (identity !== this.worldId) {
      for (const key of ['research-wait', 'minifab-wait', 'opening-attention'])
        this.notifications.dismissKey(key);
      this.worldId = identity;
      this.researchWait = this.miniWait = '';
    }
    const technology = OPENING_TECHNOLOGIES.find(
      (entry) => entry.id === opening.state.researchQueue[0],
    );
    const ledger = technology && opening.ledgers[technology.id];
    const waiting =
      opening.state.fieldEnabled &&
      technology &&
      technology.requires.every((id) => opening.ledgers[id]?.unlocked) &&
      technology.eligibility.every(
        (cost) =>
          (cost.item === 'scrap'
            ? (opening.extracted[cost.item] ?? 0)
            : (world.productionTotals[cost.item] ?? 0)) >= cost.quantity,
      ) &&
      !ledger?.unlocked &&
      technology.costs.some(
        (cost) =>
          (ledger?.consumed[cost.item] ?? 0) < cost.quantity &&
          (world.inventory[cost.item] ?? 0) === 0,
      );
    const researchWait = waiting ? technology.name : '';
    if (researchWait !== this.researchWait) {
      if (researchWait)
        this.notifications.open({
          key: 'research-wait',
          title: 'Research needs materials',
          message: `${researchWait} is waiting for a complete material bundle. Gather or craft the remaining inputs.`,
          tone: 'warning',
          timeout: 10000,
        });
      else this.notifications.dismissKey('research-wait');
      this.researchWait = researchWait;
    }
    const miniWait = [
      'ingredients',
      'handcraft',
      'retained-inputs',
      'output-full',
      'cancelled-retained',
    ].includes(opening.state.minifab.status)
      ? minifabStatus(opening.state.minifab)
      : '';
    if (miniWait !== this.miniWait) {
      if (miniWait)
        this.notifications.open({
          key: 'minifab-wait',
          title: 'MiniFab is waiting',
          message: miniWait,
          tone: 'warning',
          timeout: 10000,
        });
      else this.notifications.dismissKey('minifab-wait');
      this.miniWait = miniWait;
    }
  }
}
