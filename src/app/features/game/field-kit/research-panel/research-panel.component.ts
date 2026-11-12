import { Component, computed, ElementRef, linkedSignal, untracked, viewChild } from '@angular/core';
import { OpeningPanel } from '../opening-panel';
import { EQUIPMENT_BLUEPRINTS, RESEARCH_LAB_RULES, RESEARCH_ROADMAP } from '@content/first-factory';
import type { OpeningCommand } from '@contracts/opening';

import type { OpeningTechnology } from '@content/opening';
import { researchPrerequisitesMet } from '@core/research-prerequisites';
import { TechnologyTreeComponent } from './technology-tree/technology-tree.component';

import { ItemSprite } from '@app/shared/item-sprite/item-sprite';

@Component({
  selector: 'app-research-panel',
  imports: [ItemSprite, TechnologyTreeComponent],
  templateUrl: './research-panel.component.html',
  styleUrl: './research-panel.component.scss',
  host: { role: 'region', 'aria-labelledby': 'research-title' },
})
export class ResearchPanelComponent extends OpeningPanel {
  private readonly queueHeading = viewChild<ElementRef<HTMLElement>>('queueHeading');
  public readonly roadmap = RESEARCH_ROADMAP.filter(
    (t) => !this.technologies.some((technology) => technology.id === t.id),
  );
  public readonly labRate = RESEARCH_LAB_RULES.rate;
  public readonly queue = computed(() =>
    (this.opening()?.state.researchQueue ?? []).map((id) =>
      this.technologies.find((technology) => technology.id === id)!,
    ),
  );
  public readonly active = computed(() => this.queue().at(0) ?? null);
  public readonly selectedId = linkedSignal({
    source: () => this.runtime.restoreRevision?.() ?? 0,
    computation: () =>
      untracked(
        () =>
          this.active()?.id ??
          this.technologies.find((technology) => this.availability(technology) === 'available')
            ?.id ??
          this.technologies[0].id,
      ),
  });
  public readonly selected = computed(() =>
    this.technologies.find((technology) => technology.id === this.selectedId())!,
  );

  public prerequisitesMet(technology: OpeningTechnology): boolean {
    return researchPrerequisitesMet(technology, this.opening()?.ledgers ?? {});
  }

  public availability(technology: OpeningTechnology): 'researched' | 'available' | 'locked' {
    return this.opening()?.ledgers[technology.id]?.unlocked
      ? 'researched'
      : this.prerequisitesMet(technology)
        ? 'available'
        : 'locked';
  }

  public queueCommand(command: OpeningCommand): void {
    if (command.type === 'research-queue' && command.action === 'add') {
      const technology = this.technologies.find((entry) => entry.id === command.technology);
      if (
        !technology ||
        this.availability(technology) !== 'available' ||
        this.queued(technology.id)
      )
        return;
    }
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
      this.prerequisitesMet(technology) &&
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
      if (!this.prerequisitesMet(technology))
        return 'Locked: research prerequisite technologies first';
      return this.technologyReady(technology)
        ? 'Available; not queued'
        : 'Needs cumulative extraction / production; may be queued';
    }
    if (!this.prerequisitesMet(technology)) return 'Waiting for prerequisite technologies';
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
