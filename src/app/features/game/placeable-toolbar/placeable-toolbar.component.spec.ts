import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { PlaceableToolbarComponent } from './placeable-toolbar.component';
import { GameRuntimeService } from '../game-runtime.service';
import { emptyToolbar } from '@contracts/toolbar';
import type { PlacementFeedback } from '@contracts/game-client';
import { EQUIPMENT_BLUEPRINTS } from '@content/first-factory';
import { isPlaceable } from '@content/factory';

describe('Placeable toolbar', () => {
  it('names every catalogue placeable and keeps narrow toolbar controls anchored', async () => {
    const toolbar = signal(emptyToolbar());
    TestBed.configureTestingModule({
      imports: [PlaceableToolbarComponent],
      providers: [
        {
          provide: GameRuntimeService,
          useValue: {
            toolbar,
            world: signal({ inventory: {} }),
            activePlaceable: () => toolbar().slots[0],
            placementFeedback: signal(null),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlaceableToolbarComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.style.width = '350px';
    const button = root.querySelector<HTMLButtonElement>('button')!;
    const original = button.getBoundingClientRect();
    for (const item of EQUIPMENT_BLUEPRINTS.map((blueprint) => blueprint.id).filter(isPlaceable)) {
      toolbar.update((value) => ({ ...value, slots: [item, ...value.slots.slice(1)] }));
      await fixture.whenStable();
      expect(button.querySelector('.item-name')!.textContent!.trim(), item).not.toBe('');
      expect(button.getAttribute('aria-description'), item).not.toContain('undefined');
      expect(button.getBoundingClientRect().top, item).toBe(original.top);
      expect(button.getBoundingClientRect().height, item).toBe(original.height);
    }
    expect((await axe.run(root)).violations).toEqual([]);
  });
  it('shows bag stock, selects numbered slots, wraps keyboard focus and passes AXE without offering tools', async () => {
    const toolbar = signal(emptyToolbar());
    toolbar.update((value) => ({
      ...value,
      slots: ['solar-panel', 'recycler', 'power-connection', null, null, null, null, null],
    }));
    const runtime = {
      toolbar,
      world: signal({ inventory: { 'solar-panel': 1, recycler: 0, prybar: 1 } }),
      activePlaceable: () => toolbar().slots[toolbar().active],
      placementFeedback: signal<PlacementFeedback | null>(null),
      selectPlaceable: vi.fn((active: number) => toolbar.update((value) => ({ ...value, active }))),
    };
    TestBed.configureTestingModule({
      imports: [PlaceableToolbarComponent],
      providers: [{ provide: GameRuntimeService, useValue: runtime }],
    });
    const fixture = TestBed.createComponent(PlaceableToolbarComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement,
      buttons = root.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons).toHaveLength(8);
    expect(root.textContent).not.toContain('prybar');
    expect(buttons[1].textContent).toContain('0');
    expect(buttons[2].textContent).toContain('Power');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    root.style.width = '350px';
    const top = buttons[0].getBoundingClientRect().top;
    buttons[2].click();
    runtime.placementFeedback.set({ valid: true, reason: null, connection: 'start' });
    await fixture.whenStable();
    expect(buttons[0].getBoundingClientRect().top).toBe(top);
    expect(root.querySelector('[aria-live]')!.textContent).toContain('click two machines');
    runtime.placementFeedback.set(null);
    buttons[1].click();
    await fixture.whenStable();
    expect(runtime.selectPlaceable).toHaveBeenCalledWith(1);
    buttons[1].focus();
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement).toBe(buttons[7]);
    buttons[7].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement).toBe(buttons[0]);
    runtime.selectPlaceable
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]); // Navigation also works before worker acknowledgement.
    expect((await axe.run(root)).violations).toEqual([]);
  });
});
