import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import type { Inspection } from '@contracts/simulation';
import type { WorldView } from '@contracts/world';
import { Simulation } from '@simulation/simulation';
import { emptyTransport } from '@content/transport';
import { editableView } from '../../../../../testing/editable-view';
import { GameRuntimeService } from '../../game-runtime.service';
import { TransportPanelComponent } from './transport-panel.component';

describe('Transport inspection', () => {
  const world = signal<WorldView | null>(null),
    inspection = signal<Inspection | null>(null),
    selected = signal<string | null>('belt');
  const runtime = {
    world,
    inspection,
    selectedEntityId: selected,
    requestWorkExit: vi.fn((f: () => void) => f()),
    command: vi.fn(() => ({ status: 'queued' as const })),
  };
  beforeEach(() => {
    const sim = new Simulation({
      version: 1,
      id: 'transport-ui',
      grid: { origin: { x: 0, z: 0 }, columns: 4, rows: 4, metresPerCell: 2 },
      terrain: Array<string>(16).fill('soil'),
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    });
    const view = editableView(sim.view);
    sim.dispose();
    view.research = ['sorting-logistics'];
    view.buildings = [
      {
        id: 'belt',
        buildingId: 'conveyor',
        cell: { column: 1, row: 1 },
        position: { x: 3, y: 0, z: 3 },
        rotation: 0,
        footprint: { width: 1, depth: 1 },
      },
      {
        id: 'sorter',
        buildingId: 'sorter',
        cell: { column: 1, row: 2 },
        position: { x: 3, y: 0, z: 5 },
        rotation: 0,
        footprint: { width: 1, depth: 1 },
      },
    ];
    world.set(view);
    selected.set('belt');
    inspection.set({
      id: 'belt',
      tick: 0,
      entity: {
        id: 'belt',
        kind: 'building',
        building: view.buildings[0],
        transport: emptyTransport(),
      },
    });
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [TransportPanelComponent],
      providers: [{ provide: GameRuntimeService, useValue: runtime }],
    });
  });
  it('previews facing ports, retains a draft across worker publications and uses work-exit protection', async () => {
    const fixture = TestBed.createComponent(TransportPanelComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.link.update((d) => ({ ...d, target: 'sorter' }));
    await fixture.whenStable();
    expect(component.validLink()).toBe(true);
    inspection.update((d) => ({ ...d!, tick: 1, entity: structuredClone(d!.entity) }));
    await fixture.whenStable();
    expect(component.link().target).toBe('sorter');
    component.connect();
    expect(runtime.requestWorkExit).toHaveBeenCalledOnce();
    expect(runtime.command).toHaveBeenCalledWith({
      type: 'transport-connect',
      from: 'belt',
      output: 'front',
      to: 'sorter',
      input: 'back',
    });
    component.link.update((d) => ({ ...d, output: 'left' }));
    await fixture.whenStable();
    expect(component.validLink()).toBe(false);
    component.connect();
    expect(runtime.command).toHaveBeenCalledTimes(1);
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
  it('preserves filter drafts, prevents duplicate filters and exposes stable collection/recovery controls', async () => {
    selected.set('sorter');
    inspection.set({
      id: 'sorter',
      tick: 0,
      entity: {
        id: 'sorter',
        kind: 'building',
        building: world()!.buildings[1],
        transport: {
          ...emptyTransport(),
          filters: ['plate', 'wire'],
          units: [{ item: 'plate', lane: 0, progress: 10 }],
          status: 'blocked',
        },
      },
    });
    const fixture = TestBed.createComponent(TransportPanelComponent);
    await fixture.whenStable();
    const c = fixture.componentInstance;
    c.config.update((d) => ({ ...d, left: 'scrap' }));
    inspection.update((d) => ({ ...d!, tick: 2, entity: structuredClone(d!.entity) }));
    await fixture.whenStable();
    expect(c.config().left).toBe('scrap');
    c.config.update((d) => ({ ...d, left: 'wire' }));
    await fixture.whenStable();
    expect(c.validFilters()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('blocked');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1/4');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
});
