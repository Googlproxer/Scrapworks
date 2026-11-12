import { Component, computed, linkedSignal, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import type { MaterialPort } from '@contracts/transport';
import type { CardinalDirection, FluidCommand } from '@contracts/environment';
import { facingPorts } from '@content/transport';
import { ENVIRONMENT_SETTINGS, UTILITIES, isUtilityKind, fluidPorts } from '@content/environment';
import { OpeningPanel } from '../../field-kit/opening-panel';

import { ItemSprite } from '@app/shared/item-sprite/item-sprite';

@Component({
  imports: [ItemSprite, FormField],
  selector: 'app-utility-inspection',
  styleUrl: './utility-inspection.component.scss',
  templateUrl: './utility-inspection.component.html',
})
export class UtilityInspectionComponent extends OpeningPanel {
  public readonly directions: readonly CardinalDirection[] = ['north', 'east', 'south', 'west'];
  public readonly settings = ENVIRONMENT_SETTINGS;
  public readonly world = this.runtime.world;
  public readonly environment = computed(() => this.world()?.factory?.environment);
  public readonly selected = computed(() => {
    const detail = this.runtime.inspection();
    return detail?.id === this.runtime.selectedEntityId() && detail.entity.machine?.utility
      ? detail.entity
      : null;
  });
  public readonly ports = computed(() => fluidPorts(this.selected()?.building?.buildingId ?? ''));
  public readonly targets = computed(() =>
    (this.world()?.buildings ?? []).filter(
      (b) =>
        isUtilityKind(b.buildingId) &&
        b.id !== this.selected()?.id &&
        fluidPorts(b.buildingId).input.length,
    ),
  );
  public readonly link = linkedSignal({
    source: this.runtime.selectedEntityId,
    computation: (source) => ({
      source: source ?? '',
      target: '',
      output: 'front' as MaterialPort,
      input: 'back' as MaterialPort,
    }),
  });
  public readonly fields = form(this.link);
  public readonly targetPorts = computed(
    () =>
      fluidPorts(this.targets().find((b) => b.id === this.link().target)?.buildingId ?? '').input,
  );
  public readonly validLink = computed(() => {
    const source = this.selected()?.building,
      target = this.targets().find((b) => b.id === this.link().target),
      link = this.link();
    return (
      !!source &&
      !!target &&
      link.source === source.id &&
      this.ports().output.includes(link.output) &&
      this.targetPorts().includes(link.input) &&
      facingPorts(source, link.output, target, link.input) &&
      !(this.environment()?.connections ?? []).some(
        (e) =>
          (e.from === source.id && e.output === link.output) ||
          (e.to === target.id && e.input === link.input) ||
          (e.from === target.id && e.to === source.id),
      )
    );
  });
  public readonly connections = computed(
    () =>
      this.environment()?.connections.filter(
        (e) => e.from === this.selected()?.id || e.to === this.selected()?.id,
      ) ?? [],
  );
  public readonly notice = signal('');
  public readonly water = computed(() => {
    const data = this.selected()?.machine?.utility,
      batches = [...(data?.water ?? []), ...(data?.clean ?? [])];
    const volume = batches.reduce((n, b) => n + b.volume, 0);
    const kind = this.selected()?.building?.buildingId;
    return {
      volume,
      capacity: isUtilityKind(kind) ? UTILITIES[kind].litres : 0,
      quality: volume ? batches.reduce((n, b) => n + b.volume * b.quality, 0) / volume : 0,
      sources:
        [...new Set(batches.map((b) => b.source))]
          .map(
            (source) =>
              `${source}: ${this.seconds(batches.filter((b) => b.source === source).reduce((n, b) => n + b.volume, 0))} L`,
          )
          .join(', ') || 'None',
    };
  });
  public readonly hydraulicStatus = computed(() => {
    const entity = this.selected(),
      kind = entity?.building?.buildingId;
    if (!entity?.machine?.enabled) return 'Disabled; buffered water is retained.';
    const water = this.water();
    if (water.capacity && water.volume >= water.capacity - 1e-8)
      return 'Buffer full; upstream flow backs up and the pump stops until room is available.';
    if (
      kind === 'water-pump' &&
      this.environment()?.sources.find((s) => s.id === entity.machine?.utility?.source)?.volume ===
        0
    )
      return 'Lake empty; natural refill allows pumping to resume.';
    if (kind === 'water-treatment')
      return 'Clean water bypasses at no cost; other water requires treatment power.';
    return 'Flow uses available buffers. Disconnecting retains water; dismantling returns the connected network to its extraction sources.';
  });

  public send(command: FluidCommand): void {
    this.runtime.requestWorkExit(() => {
      const result = this.runtime.command(command);
      this.notice.set(
        result.status === 'queued'
          ? 'Pipe request queued; completion or rejection appears in notifications.'
          : 'Pipe controls are unavailable while suspended.',
      );
    });
  }

  public connect(): void {
    if (!this.validLink()) return;
    const link = this.link();
    this.send({
      type: 'fluid-connect',
      from: link.source,
      output: link.output,
      to: link.target,
      input: link.input,
    });
  }

  public overflow(direction: CardinalDirection | null): void {
    const target = this.selected()?.id;
    if (target) this.send({ type: 'fluid-overflow', target, direction });
  }
}
