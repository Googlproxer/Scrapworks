import { Component } from '@angular/core';
import { OpeningPanel } from './opening-panel';

import type { OpeningTechnology } from '../../../../content/opening';

@Component({
  selector: 'app-research-panel',
  imports: [],
  templateUrl: './research-panel.component.html',
  styleUrl: './research-panel.component.scss',
  host: { role: 'region', 'aria-labelledby': 'research-title' },
})
export class ResearchPanelComponent extends OpeningPanel {
  public technologyReady(technology: OpeningTechnology): boolean {
    const opening = this.opening();
    return (
      !!opening &&
      technology.requires.every((id) => opening.ledgers[id]?.unlocked) &&
      technology.eligibility.every(
        (cost) =>
          (cost.item === 'scrap'
            ? (opening.extracted[cost.item] ?? 0)
            : (this.runtime.world()?.productionTotals[cost.item] ?? 0)) >= cost.quantity,
      )
    );
  }

  public researchStatus(technology: OpeningTechnology): string {
    const opening = this.opening(),
      ledger = opening?.ledgers[technology.id];
    if (ledger?.unlocked) return 'Complete';
    if (!this.technologyReady(technology))
      return 'Needs prerequisites and cumulative collection / production';
    if (opening?.state.fieldTechnology !== technology.id)
      return ledger?.work ? 'Progress retained' : 'Available';
    if (!opening.state.fieldEnabled) return 'Paused; no bag withdrawals';
    const waiting = technology.costs.some(
      (cost) => (ledger?.consumed[cost.item] ?? 0) < cost.quantity && this.amount(cost.item) === 0,
    );
    return waiting
      ? 'Waiting for a complete material bundle'
      : 'Researching from uncommitted bag stock';
  }
}
