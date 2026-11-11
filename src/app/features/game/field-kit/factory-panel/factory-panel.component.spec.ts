import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { Simulation } from '@simulation/simulation';
import { editableView } from '../../../../../testing/editable-view';
import { GameRuntimeService } from '../../game-runtime.service';
import { FactoryPanelComponent } from './factory-panel.component';

describe('Factory statistics', () => {
  it('shows aggregate equipment, power and environmental statistics without machine controls', async () => {
    const sim = new Simulation({
      version: 1,
      id: 'factory-stats',
      grid: { origin: { x: 0, z: 0 }, columns: 4, rows: 4, metresPerCell: 2 },
      terrain: Array<string>(16).fill('soil'),
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    });
    const view = editableView(sim.view);
    sim.dispose();
    const building = {
      id: 'one',
      buildingId: 'recycler' as const,
      position: { x: 3, y: 0, z: 1 },
      cell: { column: 1, row: 0 },
      rotation: 0 as const,
      footprint: { width: 1, depth: 1 },
    };
    view.buildings = [building, { ...building, id: 'two' }];
    const command = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: GameRuntimeService, useValue: { world: signal(view), command } }],
    });
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Mixed-output recycler: 2');
    expect(root.textContent).toContain('Generation');
    expect(root.textContent).toContain('Restoration, weather and water');
    expect(root.querySelectorAll('button, input, select')).toHaveLength(0);
    expect(root.textContent).not.toContain('Machine inspection');
    expect(command).not.toHaveBeenCalled();
    expect((await axe.run(root)).violations).toEqual([]);
  });
});
