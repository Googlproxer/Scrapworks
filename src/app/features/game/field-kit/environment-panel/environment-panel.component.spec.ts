import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import type { Inspection } from '@contracts/simulation';
import type { WorldView } from '@contracts/world';
import { Simulation } from '@simulation/simulation';
import { newMachine } from '@simulation/factory';
import { editableView } from '../../../../../testing/editable-view';
import { GameRuntimeService } from '../../game-runtime.service';
import { EnvironmentPanelComponent } from './environment-panel.component';

describe('Environmental inspection', () => {
  const world = signal<WorldView | null>(null),
    inspection = signal<Inspection | null>(null),
    selected = signal<string | null>('junction');
  const runtime = {
    world,
    inspection,
    selectedEntityId: selected,
    requestWorkExit: vi.fn((f: () => void) => f()),
    command: vi.fn(() => ({ status: 'queued' as const })),
  };
  beforeEach(() => {
    const terrain = Array<string>(16).fill('soil');
    terrain[15] = 'water';
    const sim = new Simulation({
      version: 1,
      id: 'environment-ui',
      grid: { origin: { x: 0, z: 0 }, columns: 4, rows: 4, metresPerCell: 2 },
      terrain,
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    });
    const view = editableView(sim.view);
    sim.dispose();
    view.buildings = [
      {
        id: 'junction',
        buildingId: 'pipe-junction',
        cell: { column: 1, row: 1 },
        position: { x: 3, y: 0, z: 3 },
        rotation: 0,
        footprint: { width: 1, depth: 1 },
      },
      {
        id: 'tank',
        buildingId: 'water-tank',
        cell: { column: 2, row: 1 },
        position: { x: 5, y: 0, z: 3 },
        rotation: 0,
        footprint: { width: 1, depth: 1 },
      },
    ];
    world.set(view);
    selected.set('junction');
    inspection.set({
      id: 'junction',
      tick: 0,
      entity: {
        id: 'junction',
        kind: 'building',
        building: view.buildings[0],
        machine: newMachine('pipe-junction', 'junction', null),
      },
    });
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [EnvironmentPanelComponent],
      providers: [{ provide: GameRuntimeService, useValue: runtime }],
    });
  });
  it('keeps a pipe draft through publications, validates adjacent ports and routes edits through work-exit protection', async () => {
    const fixture = TestBed.createComponent(EnvironmentPanelComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.link.update((d) => ({ ...d, target: 'tank', output: 'right', input: 'left' }));
    await fixture.whenStable();
    expect(component.validLink()).toBe(true);
    inspection.update((d) => ({ ...d!, tick: 1, entity: structuredClone(d!.entity) }));
    await fixture.whenStable();
    expect(component.link().target).toBe('tank');
    component.connect();
    expect(runtime.requestWorkExit).toHaveBeenCalledOnce();
    expect(runtime.command).toHaveBeenCalledWith({
      type: 'fluid-connect',
      from: 'junction',
      output: 'right',
      to: 'tank',
      input: 'left',
    });
    component.overflow('west');
    expect(runtime.command).toHaveBeenLastCalledWith({
      type: 'fluid-overflow',
      target: 'junction',
      direction: 'west',
    });
    component.link.update((d) => ({ ...d, input: 'front' }));
    await fixture.whenStable();
    expect(component.validLink()).toBe(false);
  });
  it('shows source quality, persistent health, weather and completion without color-only feedback and passes AXE', async () => {
    const fixture = TestBed.createComponent(EnvironmentPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Health persists');
    expect(root.textContent).toContain('1000.0 L in');
    expect(root.textContent).toContain('quality 0.0%');
    expect(root.querySelectorAll('button[aria-pressed]').length).toBe(5);
    expect((await axe.run(root)).violations).toEqual([]);
    const view = editableView(world()!);
    view.factory!.environment!.completed = true;
    view.factory!.environment!.health.fill(100);
    view.factory!.environment!.average = 100;
    view.factory!.environment!.restored = 16;
    world.set(view);
    await fixture.whenStable();
    expect(root.textContent).toContain('Restoration checkpoint complete');
    expect(root.textContent).toContain('quality 100.0%');
    expect((await axe.run(root)).violations).toEqual([]);
  });
});
