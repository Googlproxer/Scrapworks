import { Component, computed, linkedSignal, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { CONVEYOR_TURNS, materialPorts, TRANSPORT_SETTINGS } from '@content/transport';
import { OPENING_CONTENT } from '@content/opening';
import type { ConveyorTurn, MaterialPort } from '@contracts/transport';
import type { FactoryCommand } from '@contracts/factory';
import { materialConnectionProblem } from '@simulation/transport';
import { OpeningPanel } from '../opening-panel';

@Component({
  imports: [FormField],
  selector: 'app-transport-panel',
  styleUrl: './transport-panel.component.scss',
  templateUrl: './transport-panel.component.html',
})
export class TransportPanelComponent extends OpeningPanel {
  public readonly world = this.runtime.world;
  public readonly selected = computed(() => {
    const detail = this.runtime.inspection();
    return detail?.id === this.runtime.selectedEntityId() ? detail.entity : null;
  });
  public readonly settings = TRANSPORT_SETTINGS;
  public readonly turns = CONVEYOR_TURNS;
  public readonly items = Object.keys(OPENING_CONTENT.items).sort();
  public readonly ports = computed(() => {
    const e = this.selected();
    return e?.building
      ? materialPorts(e.building.buildingId, e.transport?.turn)
      : { input: [], output: [] };
  });
  private readonly configuration = computed(
    () => {
      const e = this.selected(),
        t = e?.transport;
      return {
        id: e?.id ?? '',
        turn: t?.turn ?? 'straight',
        left: t?.filters[0] ?? '',
        right: t?.filters[1] ?? '',
      };
    },
    {
      equal: (a, b) =>
        a.id === b.id && a.turn === b.turn && a.left === b.left && a.right === b.right,
    },
  );
  public readonly config = linkedSignal(() => this.configuration());
  public readonly configFields = form(this.config);
  private readonly linkContext = computed(
    () => ({ source: this.selected()?.id ?? '', ports: this.ports().output.join(',') }),
    { equal: (a, b) => a.source === b.source && a.ports === b.ports },
  );
  public readonly link = linkedSignal(() => ({
    source: this.linkContext().source,
    target: '',
    output: (this.linkContext().ports.split(',')[0] || 'front') as MaterialPort,
    input: 'back' as MaterialPort,
  }));
  public readonly linkFields = form(this.link);
  public readonly targets = computed(
    () =>
      this.world()?.buildings.filter((b) => {
        const source = this.selected()?.building;
        return (
          !!source &&
          b.id !== source.id &&
          materialPorts(b.buildingId).input.length > 0 &&
          Math.abs(b.cell.column - source.cell.column) + Math.abs(b.cell.row - source.cell.row) ===
            1
        );
      }) ?? [],
  );
  public readonly inputs = computed(() => {
    const target = this.targets().find((b) => b.id === this.link().target);
    return target ? materialPorts(target.buildingId).input : [];
  });
  public readonly connections = computed(
    () =>
      this.world()?.factory?.transport?.connections.filter(
        (c) => c.from === this.selected()?.id || c.to === this.selected()?.id,
      ) ?? [],
  );
  public readonly linkProblem = computed(() => {
    const world = this.world(),
      draft = this.link();
    if (!world?.research.includes('sorting-logistics'))
      return 'Research Sorting and conveyors to connect materials.';
    if (!draft.target) return 'Choose a destination input.';
    if (draft.source !== this.selected()?.id) return 'Choose the source again.';
    const entities = world.buildings.map((building) => ({
      id: building.id,
      building,
      transport: world.factory?.transport?.segments.find((s) => s.id === building.id),
    }));
    return materialConnectionProblem(
      entities,
      world.factory?.transport?.connections ?? [],
      draft.source,
      draft.output,
      draft.target,
      draft.input,
    );
  });
  public readonly validLink = computed(() => this.linkProblem() === null);
  public readonly validFilters = computed(
    () => !this.config().left || this.config().left !== this.config().right,
  );
  public readonly notice = signal('');
  public readonly laneContents = computed(() =>
    [0, 1, 2].map((lane) => ({
      lane,
      items: this.materials(
        [
          ...new Set(
            (this.selected()?.transport?.units ?? [])
              .filter((u) => u.lane === lane)
              .map((u) => u.item),
          ),
        ].map((item) => ({
          item,
          quantity:
            this.selected()?.transport?.units.filter((u) => u.lane === lane && u.item === item)
              .length ?? 0,
        })),
      ),
      count: this.selected()?.transport?.units.filter((u) => u.lane === lane).length ?? 0,
    })),
  );

  public send(command: FactoryCommand): void {
    this.runtime.requestWorkExit(() => {
      const result = this.runtime.command(command);
      this.notice.set(
        result.status === 'queued'
          ? 'Request queued; completion or rejection appears in notifications.'
          : 'Transport controls are unavailable while suspended.',
      );
    });
  }

  public configure(): void {
    const target = this.selected()?.id,
      c = this.config();
    if (target && this.validFilters())
      this.send({
        type: 'transport-configure',
        target,
        turn: c.turn as ConveyorTurn,
        filters: [c.left || null, c.right || null],
      });
  }

  public connect(): void {
    if (!this.validLink()) return;
    const d = this.link();
    this.send({
      type: 'transport-connect',
      from: d.source,
      output: d.output,
      to: d.target,
      input: d.input,
    });
  }

  public disconnect(connection: string): void {
    this.send({ type: 'transport-disconnect', connection });
  }

  public endpoint(id: string): string {
    const building = this.world()?.buildings.find((b) => b.id === id);
    return building
      ? `${this.name(building.buildingId)} · ${building.cell.column + 1}, ${building.cell.row + 1}`
      : 'Removed equipment';
  }
}
