import { Component, computed, ElementRef, viewChild } from '@angular/core';
import { OpeningPanel } from './opening-panel';
import { EQUIPMENT_BLUEPRINTS, RESEARCH_LAB_RULES, RESEARCH_ROADMAP } from '@content/first-factory';
import type { OpeningCommand } from '@contracts/opening';

import type { OpeningTechnology } from '@content/opening';

@Component({
  selector: 'app-research-panel',
  imports: [],
  templateUrl: './research-panel.component.html',
  styleUrl: './research-panel.component.scss',
  host: { role: 'region', 'aria-labelledby': 'research-title' },
})
export class ResearchPanelComponent extends OpeningPanel {
  private readonly queueHeading = viewChild<ElementRef<HTMLElement>>('queueHeading');
  public readonly roadmap = RESEARCH_ROADMAP;
  public readonly labRate = RESEARCH_LAB_RULES.rate;
  public readonly queue = computed(() =>
    (this.opening()?.state.researchQueue ?? []).map((id) =>
      this.technologies.find((technology) => technology.id === id)!,
    ),
  );
  public readonly active = computed(() => this.queue()[0] ?? null);

  public queueCommand(command: OpeningCommand): void {
    this.runtime.command(command);
    this.queueHeading()?.nativeElement.focus();
  }

  public queued(id: string): boolean {
    return this.opening()?.state.researchQueue.includes(id) ?? false;
  }

  public technologyName(id: string): string {
    return this.technologies.find((technology) => technology.id === id)?.name ?? id;
  }

  public history(item: string): number {
    return item === 'scrap'
      ? (this.opening()?.extracted[item] ?? 0)
      : (this.runtime.world()?.productionTotals[item] ?? 0);
  }

  public eligibility(technology: OpeningTechnology, item: string): number {
    return technology.eligibility.find((cost) => cost.item === item)?.quantity ?? 0;
  }

  public equipment(id: string) {
    return EQUIPMENT_BLUEPRINTS.filter((equipment) => equipment.technology === id);
  }

  public unlockedRecipes(id: string) {
    return this.recipes.filter((recipe) => recipe.technology === id);
  }

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
    const position = opening?.state.researchQueue.indexOf(technology.id) ?? -1;
    if (position > 0) return `Queued ${position + 1}; only the first task can progress`;
    if (position === -1) {
      if (ledger?.work) return 'Progress retained; queue to resume';
      if (!technology.requires.every((id) => opening?.ledgers[id]?.unlocked))
        return 'Locked: prerequisite technologies; may be queued';
      return this.technologyReady(technology)
        ? 'Available; not queued'
        : 'Needs cumulative extraction / production; may be queued';
    }
    if (!technology.requires.every((id) => opening?.ledgers[id]?.unlocked))
      return 'Waiting for prerequisite technologies';
    if (!this.technologyReady(technology)) return 'Waiting for cumulative extraction / production';
    if (!opening?.state.fieldEnabled) return 'Field contributions paused; no bag withdrawals';
    const waiting = technology.costs.some(
      (cost) => (ledger?.consumed[cost.item] ?? 0) < cost.quantity && this.amount(cost.item) === 0,
    );
    return waiting
      ? 'Waiting for a complete material bundle'
      : 'Researching from uncommitted bag stock';
  }
}
