import type { WorldView } from '@contracts/world';
import { OPENING_TECHNOLOGIES } from '../../../content/opening';
import type { NotificationCenter } from './notifications';

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

/** Notify on transitions, without flooding the queue on worker publications. */
export class OpeningFeedback {
  private rejection: string | null = null;
  private message = '';
  private researchWait = '';
  private miniWait = '';
  private worldId?: string;

  public constructor(private readonly notifications: NotificationCenter) {}

  public update(world: WorldView | null): void {
    const opening = world?.opening;
    if (!world || !opening) return;
    const identity = `${world.worldId}:${world.worldGeneration ?? 0}`;
    if (identity !== this.worldId) {
      for (const key of ['opening-rejection', 'research-wait', 'minifab-wait'])
        this.notifications.dismissKey(key);
      this.worldId = identity;
      this.rejection = null;
      this.message = opening.state.message;
      this.researchWait = this.miniWait = '';
    }
    const reason =
      world.lastCommandResult?.accepted === false ? world.lastCommandResult.reason : null;
    if (reason && reason !== this.rejection)
      this.notifications.open({
        key: 'opening-rejection',
        title: 'Action unavailable',
        message: rejections[reason] ?? 'The action is unavailable here.',
        tone: 'warning',
      });
    this.rejection = reason;
    const message = opening.state.message;
    if (message !== this.message && /Batch stopped|Bag full|Salvage stopped/.test(message))
      this.notifications.open({
        key: 'opening-attention',
        title: 'Materials and capacity',
        message,
        tone: 'warning',
      });
    if (
      message !== this.message &&
      /researched\.|Handcrafting cancelled|Recovered materials|completed/i.test(message)
    )
      this.notifications.open({
        title: /researched\./.test(message) ? 'Research complete' : 'Field kit',
        message,
        tone: 'success',
      });
    this.message = message;
    const technology = OPENING_TECHNOLOGIES.find(
      (entry) => entry.id === opening.state.fieldTechnology,
    );
    const ledger = technology && opening.ledgers[technology.id];
    const waiting =
      opening.state.fieldEnabled &&
      technology &&
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
    const mini = opening.state.minifab.status;
    const miniWait = /Waiting|full|Clear retained/.test(mini) ? mini : '';
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
