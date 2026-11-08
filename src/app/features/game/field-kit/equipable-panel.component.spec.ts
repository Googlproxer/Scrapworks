import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { EquipablePanelComponent } from './equipable-panel.component';
import { GameRuntimeService } from '../game-runtime.service';
import { Simulation } from '@simulation/simulation';
import { editableView } from '../../../../testing/editable-view';

describe('Equipable inventory', () => {
  it('keeps tools equipped separately and assigns placeables without moving stock or leaving handcraft UI', async () => {
    const sim = new Simulation({
      version: 1,
      id: 'equipable-ui',
      grid: { origin: { x: 0, z: 0 }, columns: 10, rows: 10, metresPerCell: 2 },
      terrain: Array<string>(100).fill('soil'),
      spawn: { x: 1, y: 0, z: 1 },
      blockers: [],
      deposits: [],
    });
    const view = editableView(sim.view);
    sim.dispose();
    view.inventory = { recycler: 1, prybar: 1, 'power-connection': 3 };
    view.opening!.bag.slots[0] = { item: 'recycler', quantity: 1 };
    view.opening!.tool = 'prybar';
    const runtime = { world: signal(view), assignPlaceable: vi.fn(), command: vi.fn() };
    TestBed.configureTestingModule({
      imports: [EquipablePanelComponent],
      providers: [{ provide: GameRuntimeService, useValue: runtime }],
    });
    const fixture = TestBed.createComponent(EquipablePanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Tools');
    expect(root.textContent).toContain('Placeables');
    expect(root.textContent).toContain('Equipped tool: Scrap prybar');
    expect(root.textContent).not.toContain('Assign Scrap prybar');
    const select = root.querySelector('select')!;
    select.value = '3';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    runtime.world.update((value) => ({ ...value, publication: 2 }));
    await fixture.whenStable();
    expect(select.value).toBe('3');
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Assign Mixed-output recycler')!
      .click();
    expect(runtime.assignPlaceable).toHaveBeenCalledWith(3, 'recycler');
    expect(runtime.world().inventory['recycler']).toBe(1);
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Assign Power connection')!
      .click();
    expect(runtime.assignPlaceable).toHaveBeenLastCalledWith(3, 'power-connection');
    expect(runtime.world().inventory['power-connection']).toBe(3);
    expect(runtime.command).not.toHaveBeenCalled();
    expect((await axe.run(root)).violations).toEqual([]);
  });
});
