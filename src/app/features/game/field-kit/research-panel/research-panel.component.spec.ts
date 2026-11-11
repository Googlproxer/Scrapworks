import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import axe from 'axe-core';
import { OPENING_TECHNOLOGIES } from '@content/opening';
import { Simulation } from '@simulation/simulation';
import { editableView } from '../../../../../testing/editable-view';
import { GameRuntimeService } from '../../game-runtime.service';
import { ResearchPanelComponent } from './research-panel.component';
import { TechnologyTreeComponent } from './technology-tree/technology-tree.component';

describe('Technology tree', () => {
  function setup() {
    const simulation = new Simulation({
      version: 1,
      id: 'tree-test',
      grid: { origin: { x: 0, z: 0 }, columns: 4, rows: 4, metresPerCell: 2 },
      terrain: Array<string>(16).fill('soil'),
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    });
    const world = signal(simulation.view);
    simulation.dispose();
    const command = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: GameRuntimeService, useValue: { world, command, restoreRevision: signal(0) } },
      ],
    });
    const fixture = TestBed.createComponent(ResearchPanelComponent);
    const root = fixture.nativeElement as HTMLElement;
    root.style.width = '960px';
    root.style.height = '700px';
    return { fixture, root, world, command };
  }

  it('zooms around the pointer, fits the graph and restores readable scale without changing selection', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    const tree = fixture.debugElement.query(By.directive(TechnologyTreeComponent))
      .componentInstance as TechnologyTreeComponent;
    const viewport = root.querySelector<HTMLElement>('.tree-viewport')!;
    const selected = fixture.componentInstance.selectedId();
    const width = root.querySelector<HTMLElement>('.tech-tree')!.getBoundingClientRect().width;
    root.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!.click();
    await fixture.whenStable();
    expect(tree.zoom()).toBe(0.8);
    expect(
      root.querySelector<HTMLElement>('.tech-tree')!.getBoundingClientRect().width,
    ).toBeCloseTo(width * 0.8, 1);
    const bounds = viewport.getBoundingClientRect(),
      x = viewport.clientWidth / 2,
      y = viewport.clientHeight / 2;
    const point = {
      x: (viewport.scrollLeft + x) / tree.zoom(),
      y: (viewport.scrollTop + y) / tree.zoom(),
    };
    const wheel = new WheelEvent('wheel', {
      deltaY: -80,
      clientX: bounds.left + viewport.clientLeft + x,
      clientY: bounds.top + viewport.clientTop + y,
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(wheel);
    await fixture.whenStable();
    expect(wheel.defaultPrevented).toBe(true);
    expect(tree.zoom()).toBeGreaterThan(0.8);
    expect(Math.abs((viewport.scrollTop + y) / tree.zoom() - point.y)).toBeLessThan(2);
    tree.fit();
    await fixture.whenStable();
    const space = root.querySelector<HTMLElement>('.tree-space')!;
    expect(space.offsetWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);
    expect(space.offsetHeight).toBeLessThanOrEqual(viewport.clientHeight + 1);
    tree.resetZoom();
    await fixture.whenStable();
    expect(tree.zoom()).toBe(1);
    expect(fixture.componentInstance.selectedId()).toBe(selected);
  });

  it('pans by dragging a node, suppresses its pointer click and releases drag handlers on completion/destruction', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    const viewport = root.querySelector<HTMLElement>('.tree-viewport')!;
    const recovery = root.querySelector<HTMLButtonElement>(
      '[data-technology="material-recovery"]',
    )!;
    vi.spyOn(viewport, 'setPointerCapture').mockImplementation(() => undefined);
    viewport.scrollLeft = 100;
    viewport.scrollTop = 100;
    recovery.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 4,
        pointerType: 'mouse',
        button: 0,
        clientX: 200,
        clientY: 200,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 4,
        clientX: 120,
        clientY: 160,
        cancelable: true,
      }),
    );
    expect(viewport.scrollLeft).toBe(180);
    expect(viewport.scrollTop).toBe(140);
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4 }));
    recovery.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.selectedId()).toBe('improvised-tools');
    document.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 4, clientX: 20, clientY: 20 }),
    );
    expect(viewport.scrollLeft).toBe(180);
    recovery.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedId()).toBe('material-recovery');
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 5,
        pointerType: 'mouse',
        button: 0,
        clientX: 200,
        clientY: 200,
        bubbles: true,
      }),
    );
    fixture.destroy();
    const left = viewport.scrollLeft;
    document.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 5, clientX: 20, clientY: 20 }),
    );
    expect(viewport.scrollLeft).toBe(left);
  });

  it('renders every prerequisite, selects locked tech and gates queuing independently of inputs/history', async () => {
    const { fixture, root, world, command } = setup();
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-technology]')).toHaveLength(OPENING_TECHNOLOGIES.length);
    expect(root.querySelectorAll('[data-prerequisite]')).toHaveLength(
      OPENING_TECHNOLOGIES.reduce((n, technology) => n + technology.requires.length, 0),
    );
    for (const technology of OPENING_TECHNOLOGIES)
      for (const prerequisite of technology.requires)
        expect(
          root.querySelector(
            `[data-prerequisite="${prerequisite}"][data-dependent="${technology.id}"]`,
          ),
        ).not.toBeNull();
    const tool = root.querySelector<HTMLButtonElement>('[data-technology="improvised-tools"]')!;
    const recovery = root.querySelector<HTMLButtonElement>(
      '[data-technology="material-recovery"]',
    )!;
    expect(tool.classList.contains('available')).toBe(true);
    expect(recovery.classList.contains('locked')).toBe(true);
    recovery.click();
    await fixture.whenStable();
    expect(root.querySelector('.technology')!.textContent).toContain('Improvised tools');
    expect(root.querySelector<HTMLButtonElement>('.technology > button')!.disabled).toBe(true);
    fixture.componentInstance.queueCommand({
      type: 'research-queue',
      action: 'add',
      technology: 'material-recovery',
    });
    expect(command).not.toHaveBeenCalled();
    const positions = [...root.querySelectorAll<HTMLElement>('[data-technology]')].map((node) => [
      node.style.left,
      node.style.top,
    ]);
    const updated = editableView(world());
    updated.opening!.ledgers['improvised-tools'] = {
      consumed: { scrap: 4 },
      work: 6,
      unlocked: true,
    };
    world.set(updated);
    await fixture.whenStable();
    expect(tool.classList.contains('researched')).toBe(true);
    expect(recovery.classList.contains('available')).toBe(true);
    const queue = root.querySelector<HTMLButtonElement>('.technology > button')!;
    expect(queue.disabled).toBe(false); // Empty bag and zero extraction history still permit queuing.
    queue.click();
    expect(command).toHaveBeenCalledExactlyOnceWith({
      type: 'research-queue',
      action: 'add',
      technology: 'material-recovery',
    });
    expect(world()).toEqual(updated);
    expect(
      [...root.querySelectorAll<HTMLElement>('[data-technology]')].map((node) => [
        node.style.left,
        node.style.top,
      ]),
    ).toEqual(positions);
    expect((await axe.run(root)).violations).toEqual([]);
  });

  it('reveals keyboard-focused nodes and retains selection while active/queued badges update', async () => {
    const { fixture, root, world } = setup();
    await fixture.whenStable();
    const first = root.querySelector<HTMLButtonElement>('[data-technology="improvised-tools"]')!;
    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    const last = root.querySelector<HTMLButtonElement>('[data-technology="pollution-mitigation"]')!;
    expect(document.activeElement).toBe(last);
    expect(root.querySelector('.tree-viewport')!.scrollLeft).toBeGreaterThan(0);
    last.click();
    await fixture.whenStable();
    const updated = editableView(world());
    updated.opening!.state.researchQueue = ['improvised-tools'];
    world.set(updated);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedId()).toBe('pollution-mitigation');
    expect(first.querySelector('.queue-badge')!.textContent).toBe('Active');
    expect(first.classList.contains('available')).toBe(true);
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);
    root.style.width = '350px';
    await fixture.whenStable();
    expect((await axe.run(root)).violations).toEqual([]);
  });
});
