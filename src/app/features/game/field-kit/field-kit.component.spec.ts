import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import type { ActionFrame, BindingProfile } from '@contracts/input';
import { defaultProfile } from '@contracts/input';
import type { WorldView } from '@contracts/world';
import type { OpeningCommand } from '@contracts/opening';
import { Simulation } from '@simulation/simulation';
import { GameRuntimeService } from '../game-runtime.service';
import { editableView } from '../../../../testing/editable-view';
import { FieldKitComponent } from './field-kit.component';

describe('Field kit opening UI', () => {
  const definition = {
    version: 1 as const,
    id: 'field-kit-test',
    grid: { origin: { x: 0, z: 0 }, columns: 10, rows: 10, metresPerCell: 2 },
    terrain: Array<string>(100).fill('soil'),
    spawn: { x: 1, y: 0, z: 1 },
    deposits: [],
    blockers: [],
  };
  let emit: (frame: ActionFrame) => void;
  const world = signal<WorldView | null>(null);
  const profile = signal<BindingProfile>(structuredClone(defaultProfile));
  const runtime = {
    world,
    settings: { profile },
    selection: signal<string | null>(null),
    fieldKitOpen: signal(true),
    workExitWarning: signal(false),
    restoreRevision: signal(0),
    command: vi.fn<(command: OpeningCommand) => void>(),
    toggleFieldKit: vi.fn(),
    focusViewport: vi.fn(),
    resolveWorkExit: vi.fn(),
    requestWorkExit: vi.fn((continuation: () => void) => continuation()),
    subscribeActions: vi.fn((listener: (frame: ActionFrame) => void) => {
      emit = listener;
      return () => undefined;
    }),
  };

  beforeEach(() => {
    const simulation = new Simulation(definition);
    world.set(simulation.view);
    simulation.dispose();
    runtime.fieldKitOpen.set(true);
    runtime.workExitWarning.set(false);
    profile.set(structuredClone(defaultProfile));
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [FieldKitComponent],
      providers: [{ provide: GameRuntimeService, useValue: runtime }],
    });
  });

  it('presents all 24 slots, explicit empty state and accessible opening guidance', async () => {
    const fixture = TestBed.createComponent(FieldKitComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.bag li')).toHaveLength(24);
    expect(root.textContent).toContain('Bare hands');
    expect(root.textContent).toContain('Move with your movement controls');
    expect(root.querySelector('[aria-labelledby="nearby-title"]')).toBeNull();
    expect(getComputedStyle(root.querySelector('#research-panel')!).display).toBe('none');
    root.querySelector<HTMLButtonElement>('#research-tab')!.click();
    await fixture.whenStable();
    expect(root.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('false');
    expect((await axe.run(root)).violations).toEqual([]);
  });

  it('submits handcraft and research requests without mutating a completed worker view', async () => {
    const view = editableView(world()!);
    view.opening!.ledgers['improvised-tools'] = { consumed: { scrap: 4 }, work: 6, unlocked: true };
    view.opening!.extracted = { scrap: 8 };
    world.set(view);
    const before = structuredClone(view);
    const fixture = TestBed.createComponent(FieldKitComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Handcraft 1')!
      .click();
    expect(runtime.command.mock.calls.map(([command]) => command)).toEqual([
      { type: 'handcraft-ui', visible: true },
      { type: 'craft', recipe: 'scrap-prybar', quantity: 1 },
    ]);
    root.querySelector<HTMLButtonElement>('#research-tab')!.click();
    await fixture.whenStable();
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Queue Material recovery')!
      .click();
    expect(runtime.command).toHaveBeenLastCalledWith({
      type: 'research-queue',
      action: 'add',
      technology: 'material-recovery',
    });
    expect(world()).toEqual(before);
  });

  it('exposes one active queue, keyboard reorder/removal controls, retained progress and stable focus', async () => {
    const view = editableView(world()!);
    view.opening!.state.researchQueue = ['improvised-tools', 'material-recovery'];
    view.opening!.state.fieldEnabled = true;
    view.opening!.ledgers['improvised-tools'] = {
      consumed: { scrap: 1 },
      work: 2,
      unlocked: false,
    };
    world.set(view);
    const fixture = TestBed.createComponent(FieldKitComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('#research-tab')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.research-queue [role="status"]')?.textContent).toContain(
      'Current: Improvised tools',
    );
    expect(root.querySelector('.research-queue .research-requirements')?.textContent).toContain(
      '4 Mixed scrap',
    );
    expect(
      root.querySelector('[aria-labelledby="technology-improvised-tools"] .research-requirements')
        ?.textContent,
    ).toContain('6 s fully supplied');
    const move = root.querySelector<HTMLButtonElement>(
      '[aria-label="Move down: Improvised tools"]',
    )!;
    move.focus();
    move.click();
    expect(runtime.command).toHaveBeenLastCalledWith({
      type: 'research-queue',
      action: 'move',
      technology: 'improvised-tools',
      index: 1,
    });
    expect(document.activeElement?.id).toBe('queue-title');
    root
      .querySelector<HTMLButtonElement>('[aria-label="Remove Improvised tools from queue"]')!
      .click();
    expect(runtime.command).toHaveBeenLastCalledWith({
      type: 'research-queue',
      action: 'remove',
      technology: 'improvised-tools',
    });
    const updated = editableView(world()!);
    updated.opening!.state.researchQueue = ['material-recovery'];
    world.set(updated);
    await fixture.whenStable();
    expect(root.querySelector('.research-queue [role="status"]')?.textContent).toContain(
      'Waiting for prerequisite technologies',
    );
    expect(
      root.querySelector('[aria-labelledby="technology-improvised-tools"]')?.textContent,
    ).toContain('Progress retained; queue to resume');
    expect(world()!.opening!.ledgers['improvised-tools'].work).toBe(2);
    expect(document.activeElement?.id).toBe('queue-title');
    expect((await axe.run(root)).violations).toEqual([]);
  });

  it('traps exit confirmation focus and explains completed-item retention and original-input refunds', async () => {
    runtime.workExitWarning.set(true);
    const fixture = TestBed.createComponent(FieldKitComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Completed items remain');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect((await axe.run(root)).violations).toEqual([]);
    dialog.querySelector('button')!.click();
    expect(runtime.resolveWorkExit).toHaveBeenCalledWith(false);
    dialog.querySelectorAll('button')[1].click();
    expect(runtime.resolveWorkExit).toHaveBeenCalledWith(true);
  });

  it('supports tab keys and reserves work geometry through craft start/completion', async () => {
    const fixture = TestBed.createComponent(FieldKitComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const kit = root.querySelector<HTMLElement>('#field-kit')!;
    const before = kit.getBoundingClientRect();
    const cancel = root.querySelector<HTMLButtonElement>('.handcraft-status button')!;
    const cancelBox = cancel.getBoundingClientRect();
    const view = editableView(world()!);
    view.opening!.state.handcraft = {
      id: 'job1',
      recipe: 'metal-plate',
      remaining: 1,
      inputs: [{ item: 'scrap', quantity: 2 }],
      unitsLeft: 1,
    };
    world.set(view);
    await fixture.whenStable();
    expect(kit.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    expect(
      root.querySelector('.handcraft-status button')!.getBoundingClientRect().toJSON(),
    ).toEqual(cancelBox.toJSON());
    const inventoryTab = root.querySelector<HTMLButtonElement>('#inventory-tab')!;
    inventoryTab.focus();
    inventoryTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(root.querySelector('#research-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.id).toBe('research-tab');
    expect(kit.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    root
      .querySelector('#research-tab')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
      );
    await fixture.whenStable();
    expect(inventoryTab.getAttribute('aria-selected')).toBe('true');
    view.opening!.state.handcraft = null;
    world.set(structuredClone(view));
    await fixture.whenStable();
    expect(
      root.querySelector('.handcraft-status button')!.getBoundingClientRect().toJSON(),
    ).toEqual(cancelBox.toJSON());
  });

  it('uses real keyboard travel and selected-stick samples with equal angular gain and no stationary charge', async () => {
    const view = editableView(world()!);
    view.opening!.state.minifab.owned = true;
    world.set(view);
    const fixture = TestBed.createComponent(FieldKitComponent);
    await fixture.whenStable();
    const handle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-winding]',
    )!;
    handle.focus();
    for (const code of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
      handle.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
    }
    expect(runtime.command.mock.calls.map(([command]) => command)).toEqual(
      Array.from({ length: 4 }, () => ({ type: 'wind', degrees: 90 })),
    );
    runtime.command.mockClear();
    for (const code of ['ArrowDown', 'ArrowUp']) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
      handle.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
    }
    expect(
      runtime.command.mock.calls.reduce(
        (degrees, [command]) => degrees + (command.type === 'wind' ? Math.abs(command.degrees) : 0),
        0,
      ),
    ).toBe(360);
    runtime.command.mockClear();
    for (const value of [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
    ])
      emit({ context: 'ui', revision: 1, states: { wind: { kind: 'vector2', value } } });
    expect(runtime.command.mock.calls.map(([command]) => command)).toEqual(
      Array.from({ length: 4 }, () => ({ type: 'wind', degrees: 90 })),
    );
    runtime.command.mockClear();
    for (let n = 0; n < 10; n++)
      emit({
        context: 'ui',
        revision: 1,
        states: { wind: { kind: 'vector2', value: { x: 0, y: 1 } } },
      });
    expect(runtime.command).not.toHaveBeenCalled();
    runtime.restoreRevision.update((value) => value + 1);
    await fixture.whenStable();
    emit({
      context: 'ui',
      revision: 2,
      states: { wind: { kind: 'vector2', value: { x: 1, y: 0 } } },
    });
    expect(runtime.command).not.toHaveBeenCalled();
    handle.blur();
    emit({
      context: 'gameplay',
      revision: 2,
      states: { wind: { kind: 'vector2', value: { x: 1, y: 0 } } },
    });
    expect(runtime.command).not.toHaveBeenCalled();
  });
});
