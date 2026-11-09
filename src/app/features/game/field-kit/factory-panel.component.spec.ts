import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import type { WorldCommand, WorldView } from '@contracts/world';
import type { Inspection } from '@contracts/simulation';
import { Simulation } from '@simulation/simulation';
import { OPENING_TECHNOLOGIES } from '@content/opening';
import { newMachine } from '@simulation/factory';
import { FactoryPanelComponent } from './factory-panel.component';
import { GameRuntimeService } from '../game-runtime.service';
import { editableView } from '../../../../testing/editable-view';
import { RECYCLER_OUTCOMES } from '@content/factory';
import type { FactoryJob, MachineData, MachineKind } from '@contracts/factory';
import { GameSession } from '../../../../../tools/testing/inline-game-session';

describe('Factory controls', () => {
  const definition = {
    version: 1 as const,
    id: 'factory-ui',
    grid: { origin: { x: 0, z: 0 }, columns: 10, rows: 10, metresPerCell: 2 },
    terrain: Array<string>(100).fill('soil'),
    spawn: { x: 1, y: 0, z: 1 },
    deposits: [],
    blockers: [],
  };
  const world = signal<WorldView | null>(null),
    inspection = signal<Inspection | null>(null),
    selected = signal<string | null>(null);
  const runtime = {
    world,
    inspection,
    selectedEntityId: selected,
    selection: signal(null),
    requestWorkExit: vi.fn((fn: () => void) => fn()),
    command: vi.fn(() => ({ status: 'queued' as const, sequence: 1, generation: 1 })),
    inspectFactory: vi.fn((id: string) => selected.set(id || null)),
  };
  beforeEach(() => {
    const sim = new Simulation(definition),
      view = editableView(sim.view);
    sim.dispose();
    view.inventory = { recycler: 1, scrap: 100 };
    view.opening!.bag.slots[0] = { item: 'scrap', quantity: 100 };
    view.opening!.ledgers['mixed-recycling'] = { unlocked: true, work: 45, consumed: {} };
    world.set(view);
    inspection.set(null);
    selected.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [FactoryPanelComponent],
      providers: [{ provide: GameRuntimeService, useValue: runtime }],
    });
  });

  function inspectMachine(kind: MachineKind, overrides: Partial<MachineData> = {}): void {
    const view = editableView(world()!);
    const building = {
      id: 'advice-machine',
      buildingId: kind,
      position: { x: 3, y: 0, z: 1 },
      cell: { column: 1, row: 0 },
      footprint: { width: 1, depth: 1 },
      rotation: 0 as const,
    };
    view.buildings = [building];
    world.set(view);
    selected.set(building.id);
    inspection.set({
      id: building.id,
      tick: view.tick,
      entity: {
        id: building.id,
        kind: 'building',
        building,
        machine: { ...newMachine(kind, building.id, null), ...overrides },
      },
    });
  }

  it.each(['solar-panel', 'wind-turbine'] as const)(
    'describes healthy idle %s generation without asking for a recipe',
    async (kind) => {
      inspectMachine(kind);
      const before = structuredClone(inspection());
      const fixture = TestBed.createComponent(FactoryPanelComponent);
      await fixture.whenStable();
      const advice = (fixture.nativeElement as HTMLElement).querySelector('[data-machine-advice]')!;
      expect(advice.textContent).toContain('generation');
      expect(advice.textContent).not.toMatch(/recipe|input count/);
      expect(runtime.command).not.toHaveBeenCalled();
      expect(inspection()).toEqual(before);
    },
  );

  it('updates lab recovery advice as the shared queue becomes eligible and supplied', async () => {
    const machine = newMachine('laboratory', 'advice-machine', null);
    machine.status = 'missing-input';
    machine.input.slots[0] = { item: 'scrap', quantity: 8 };
    inspectMachine('laboratory', machine);
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const advice = () => root.querySelector('[data-machine-advice]')!.textContent!;

    expect(advice()).toContain('Queue a technology');
    expect(advice()).not.toContain('Load the recipe');

    const view = editableView(world()!);
    view.opening!.state.researchQueue = ['material-recovery'];
    world.set(view);
    await fixture.whenStable();
    expect(advice()).toContain('prerequisite');

    view.opening!.ledgers['improvised-tools'] = { unlocked: true, work: 6, consumed: { scrap: 4 } };
    world.set(editableView(view));
    await fixture.whenStable();
    expect(advice()).toContain('cumulative extraction');

    view.opening!.extracted['scrap'] = 8;
    world.set(editableView(view));
    await fixture.whenStable();
    expect(advice()).toContain('lab’s input buffer');

    inspectMachine('laboratory', { ...machine, status: 'working' });
    await fixture.whenStable();
    expect(advice()).toContain('shared Research queue');
    expect((await axe.run(root)).violations).toEqual([]);
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it.each(['greenhouse', 'water-treatment'] as const)(
    'directs a starved %s to piped water instead of bag ingredients',
    async (kind) => {
      inspectMachine(kind, { status: 'missing-input' });
      const fixture = TestBed.createComponent(FactoryPanelComponent);
      await fixture.whenStable();
      const advice = (fixture.nativeElement as HTMLElement).querySelector('[data-machine-advice]')!;
      expect(advice.textContent).toContain('water');
      expect(advice.textContent).not.toMatch(/recipe|bag/);
    },
  );

  it('asks an unconfigured fabricator to select a recipe before loading inputs', async () => {
    inspectMachine('basic-fabricator', { status: 'missing-input' });
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-machine-advice]')!.textContent).toContain(
      'Choose a researched recipe',
    );
    inspectMachine('basic-fabricator', { status: 'missing-input', recipe: 'metal-plate' });
    await fixture.whenStable();
    expect(root.querySelector('[data-machine-advice]')!.textContent).toContain(
      'required materials',
    );
  });

  it('keeps disable, power and water-buffer recovery ahead of normal equipment advice', async () => {
    inspectMachine('water-pump', { status: 'blocked' });
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const advice = () => root.querySelector('[data-machine-advice]')!.textContent!;

    expect(advice()).toContain('downstream water buffers');
    inspectMachine('water-pump', { status: 'no-power' });
    await fixture.whenStable();
    expect(advice()).toContain('power connections');
    inspectMachine('water-pump', { enabled: false, status: 'disabled' });
    await fixture.whenStable();
    expect(advice()).toContain('Enable this machine');
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'battery', text: 'stores surplus generation' },
    { kind: 'pipe', text: 'facing water ports' },
  ] as const)(
    'explains passive $kind operation without manufacturing instructions',
    async ({ kind, text }) => {
      inspectMachine(kind);
      const fixture = TestBed.createComponent(FactoryPanelComponent);
      await fixture.whenStable();
      const advice = (fixture.nativeElement as HTMLElement).querySelector('[data-machine-advice]')!;
      expect(advice.textContent).toContain(text);
      expect(advice.textContent).not.toMatch(/recipe|input count/);
    },
  );

  it('retains factory inspection and power feedback while directing construction to the toolbar', async () => {
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Equipable');
    expect(root.textContent).toContain('press B to build');
    expect(root.textContent).toContain('No machines placed');
    expect(root.querySelector('#factory-equipment')).toBeNull();
    expect((await axe.run(root)).violations).toEqual([]);
  });
  it('shows bounded outcomes and local buffers, routes transfers through handcraft exit protection and restores focus after removal', async () => {
    const view = editableView(world()!);
    const building = {
      id: 'building-1',
      buildingId: 'recycler' as const,
      position: { x: 3, y: 0, z: 1 },
      cell: { column: 1, row: 0 },
      footprint: { width: 1, depth: 1 },
      rotation: 0 as const,
    };
    view.buildings = [building];
    world.set(view);
    selected.set(building.id);
    inspection.set({
      id: building.id,
      tick: 0,
      entity: {
        id: building.id,
        kind: 'building',
        building,
        machine: newMachine('recycler', building.id, null),
      },
    });
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('both refined materials within three batches');
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Load input from bag')!
      .click();
    expect(runtime.requestWorkExit).toHaveBeenCalled();
    expect(runtime.command).toHaveBeenLastCalledWith({
      type: 'factory-transfer',
      target: building.id,
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: 1,
    });
    expect((await axe.run(root)).violations).toEqual([]);
    world.set({ ...view, buildings: [] });
    await fixture.whenStable();
    expect(runtime.inspectFactory).toHaveBeenCalledWith('');
    expect(document.activeElement?.id).toBe('machine-title');
  });

  it('lists each bag material once and requests the full combined quantity across stacks', async () => {
    const view = editableView(world()!);
    view.opening!.bag.slots[0] = { item: 'scrap', quantity: 60 };
    view.opening!.bag.slots[1] = { item: 'wire', quantity: 5 };
    view.opening!.bag.slots[2] = { item: 'scrap', quantity: 90 };
    view.inventory = { scrap: 150, wire: 5 };
    const building = {
      id: 'building-1',
      buildingId: 'recycler' as const,
      position: { x: 3, y: 0, z: 1 },
      cell: { column: 1, row: 0 },
      footprint: { width: 1, depth: 1 },
      rotation: 0 as const,
    };
    view.buildings = [building];
    world.set(view);
    selected.set(building.id);
    inspection.set({
      id: building.id,
      tick: 0,
      entity: {
        id: building.id,
        kind: 'building',
        building,
        machine: newMachine('recycler', building.id, null),
      },
    });
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement,
      selector = root.querySelector<HTMLSelectElement>('#factory-item')!,
      count = root.querySelector<HTMLInputElement>('input[type="number"]')!,
      load = [...root.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Load input from bag',
      )!;
    expect([...selector.options].map((option) => option.value)).toEqual(['scrap']);
    expect(selector.options[0].textContent).toContain('150 available');
    count.value = '150';
    count.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(load.disabled).toBe(false);
    load.click();
    expect(runtime.command).toHaveBeenCalledWith({
      type: 'factory-transfer',
      target: building.id,
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: 150,
    });
    count.value = '151';
    count.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(load.disabled).toBe(true);
    const empty = editableView(view);
    empty.opening!.bag.slots[0] = empty.opening!.bag.slots[2] = null;
    empty.inventory = { wire: 5 };
    world.set(empty);
    await fixture.whenStable();
    expect(selector.value).toBe('scrap');
    expect(selector.options[0].textContent).toContain('0 available');
    expect(load.disabled).toBe(true);
  });

  it('keeps invalid transfer quantities out of the session and resumes valid collection', async () => {
    const initial = new Simulation(definition),
      snapshot = initial.capture();
    initial.dispose();
    for (const technology of OPENING_TECHNOLOGIES)
      snapshot.resources.research[technology.id] = {
        consumed: Object.fromEntries(technology.costs.map((s) => [s.item, s.quantity])),
        work: technology.seconds,
        unlocked: true,
      };
    const bag = snapshot.entities.find((e) => e.kind === 'player')!.inventory!;
    bag.slots[0] = { item: 'recycler', quantity: 1 };
    bag.slots[1] = { item: 'scrap', quantity: 20 };
    const session = new GameSession(definition, {
      capture: {
        world: snapshot,
        ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
        pending: [],
      },
    });
    try {
      await session.ready;
      session.enqueue({
        type: 'factory-place',
        equipment: 'recycler',
        cell: { column: 1, row: 0 },
        rotation: 0,
      });
      session.advance(0.05);
      const target = session.readView().buildings[0].id;
      session.enqueue({ type: 'factory-configure', target, enabled: false, recipe: null });
      session.enqueue({
        type: 'factory-transfer',
        target,
        buffer: 'input',
        direction: 'load',
        item: 'scrap',
        quantity: 20,
      });
      session.advance(0.05);
      world.set(session.readView());
      selected.set(target);
      inspection.set(await session.inspect(target));
      const submit = vi.fn((command: WorldCommand) => ({
        status: 'queued' as const,
        sequence: session.enqueue(command),
        generation: session.generation,
      }));
      TestBed.overrideProvider(GameRuntimeService, { useValue: { ...runtime, command: submit } });
      const fixture = TestBed.createComponent(FactoryPanelComponent);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement,
        count = root.querySelector<HTMLInputElement>('input[type="number"]')!,
        transfers = [...root.querySelectorAll<HTMLButtonElement>('button')].filter(
          (button) =>
            !button.closest('[aria-hidden="true"]') &&
            /^(Load input from bag|Collect .+ from (input|output))$/.test(
              button.textContent!.trim(),
            ),
        ),
        collect = transfers.find(
          (button) => button.textContent!.trim() === 'Collect Mixed scrap from input',
        )!;
      expect(transfers.length).toBeGreaterThan(1);
      expect(collect.disabled).toBe(false);
      const original = await session.inspect(target),
        originalBag = session.readView().inventory;
      for (const invalid of ['0', '-1', '1.5', '9007199254740992', '']) {
        count.value = invalid;
        count.dispatchEvent(new Event('input', { bubbles: true }));
        await fixture.whenStable();
        for (const button of transfers) {
          expect(button.disabled).toBe(true);
          button.click();
        }
        // Direct calls must also be safe before Angular updates a button's disabled state.
        fixture.componentInstance.transfer('input', 'load');
        fixture.componentInstance.transfer('input', 'unload', 'scrap');
        fixture.componentInstance.transfer('output', 'unload', 'scrap');
        const tick = session.readView().tick;
        session.advance(0.05);
        expect(session.failed).toBe(false);
        expect(session.readView().tick).toBe(tick + 1);
        expect(submit).not.toHaveBeenCalled();
        expect(session.readView().inventory).toEqual(originalBag);
        expect((await session.inspect(target))!.entity.machine).toEqual(original!.entity.machine);
      }
      count.value = '1';
      count.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      expect(collect.disabled).toBe(false);
      collect.click();
      session.advance(0.05);
      expect(session.failed).toBe(false);
      expect(submit).toHaveBeenCalledExactlyOnceWith({
        type: 'factory-transfer',
        target,
        buffer: 'input',
        direction: 'unload',
        item: 'scrap',
        quantity: 1,
      });
      expect(session.acknowledgements.at(-1)!.result).toEqual({ accepted: true, reason: null });
      expect(session.readView().inventory['scrap']).toBe(1);
      expect((await session.inspect(target))!.entity.machine!.input.slots[0]!.quantity).toBe(19);
    } finally {
      session.dispose();
    }
  });

  it('collects all output with one guarded request independent of the manual transfer quantity', async () => {
    const view = editableView(world()!);
    const building = {
      id: 'building-1',
      buildingId: 'recycler' as const,
      position: { x: 3, y: 0, z: 1 },
      cell: { column: 1, row: 0 },
      footprint: { width: 1, depth: 1 },
      rotation: 0 as const,
    };
    view.buildings = [building];
    world.set(view);
    selected.set(building.id);
    const machine = newMachine('recycler', building.id, null);
    let tick = 0;

    const publish = () =>
      inspection.set({
        id: building.id,
        tick: ++tick,
        entity: { id: building.id, kind: 'building', building, machine: structuredClone(machine) },
      });

    publish();
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement,
      collect = [...root.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Collect all output',
      )!;
    expect(collect.disabled).toBe(true);
    machine.output.slots[0] = { item: 'plate', quantity: 6 };
    machine.output.slots[1] = { item: 'wire', quantity: 8 };
    publish();
    const count = root.querySelector<HTMLInputElement>('input[type="number"]')!;
    count.value = '999';
    count.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(collect.disabled).toBe(false);
    collect.click();
    expect(runtime.requestWorkExit).toHaveBeenCalledTimes(1);
    expect(runtime.command).toHaveBeenCalledTimes(1);
    expect(runtime.command).toHaveBeenCalledWith({
      type: 'factory-collect-output',
      target: building.id,
    });
    machine.output.slots.fill(null);
    publish();
    await fixture.whenStable();
    expect(collect.disabled).toBe(true);
    expect(root.contains(collect)).toBe(true);
    expect((await axe.run(root)).violations).toEqual([]);
  });

  it('uses the applied recipe for material choices, keeps draft choices stable and permits collecting stored leftovers', async () => {
    const view = editableView(world()!);
    view.research = OPENING_TECHNOLOGIES.map((t) => t.id);
    view.opening!.bag.slots[0] = { item: 'scrap', quantity: 100 };
    view.opening!.bag.slots[1] = { item: 'plate', quantity: 40 };
    view.opening!.bag.slots[2] = { item: 'wire', quantity: 30 };
    view.opening!.bag.slots[3] = { item: 'mechanical-part', quantity: 10 };
    view.opening!.bag.slots[4] = { item: 'electrical-part', quantity: 10 };
    const building = {
      id: 'building-1',
      buildingId: 'medium-fabricator' as const,
      position: { x: 3, y: 0, z: 1 },
      cell: { column: 1, row: 0 },
      footprint: { width: 1, depth: 1 },
      rotation: 0 as const,
    };
    const machine = newMachine('medium-fabricator', building.id, null);
    machine.recipe = 'electrical-part';
    view.buildings = [building];
    world.set(view);
    selected.set(building.id);
    let tick = 0;

    const publish = () =>
      inspection.set({
        id: building.id,
        tick: ++tick,
        entity: {
          id: building.id,
          kind: 'building',
          building,
          machine: structuredClone(machine),
        },
      });

    publish();
    const fixture = TestBed.createComponent(FactoryPanelComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement,
      material = root.querySelector<HTMLSelectElement>('#factory-item')!,
      recipe = root.querySelector<HTMLSelectElement>('#factory-recipe')!;

    const materials = () => [...material.options].map((option) => option.value);

    const collections = () =>
      [...root.querySelectorAll('button')]
        .filter(
          (b) =>
            !b.closest('[aria-hidden="true"]') &&
            b.textContent?.trim().startsWith('Collect') &&
            b.textContent.includes(' from '),
        )
        .map((b) => b.textContent!.trim());

    expect(materials()).toEqual(['plate', 'wire']);
    expect(material.value).toBe('plate');
    expect(recipe.value).toBe('electrical-part');
    expect(collections()).toEqual([
      'Collect Metal plate from input',
      'Collect Recovered wire from input',
      'Collect Electrical part from output',
    ]);
    recipe.value = 'basic-research-kit';
    recipe.dispatchEvent(new Event('input', { bubbles: true }));
    recipe.dispatchEvent(new Event('change', { bubbles: true }));
    publish();
    await fixture.whenStable();
    expect(recipe.value).toBe('basic-research-kit');
    expect(materials()).toEqual(['plate', 'wire']); // Draft selection is not yet configured.
    machine.recipe = 'basic-research-kit';
    publish();
    await fixture.whenStable();
    expect(materials()).toEqual(['electrical-part', 'mechanical-part']);
    expect(collections()).toEqual([
      'Collect Electrical part from input',
      'Collect Mechanical part from input',
      'Collect Basic research kit from output',
    ]);
    machine.input.slots[0] = { item: 'plate', quantity: 4 };
    machine.output.slots[0] = { item: 'electrical-part', quantity: 1 };
    publish();
    await fixture.whenStable();
    expect(materials()).not.toContain('plate');
    expect(collections()).toContain('Collect Metal plate from input');
    expect(collections()).toContain('Collect Electrical part from output');
    expect(collections()).not.toContain('Collect Basic Fabricator from output');
    machine.recipe = null;
    publish();
    await fixture.whenStable();
    expect(materials()).toEqual(['']);
    expect(collections()).toEqual([
      'Collect Metal plate from input',
      'Collect Electrical part from output',
    ]);
    expect((await axe.run(root)).violations).toEqual([]);
  });

  it.each([1100, 350])(
    'anchors inspection controls across empty, working and blocked cycles at %i px',
    async (width) => {
      for (const kind of ['extractor', 'recycler'] as const) {
        const view = editableView(world()!);
        const building = {
          id: 'building-1',
          buildingId: kind,
          position: { x: 3, y: 0, z: 1 },
          cell: { column: 1, row: 0 },
          footprint: { width: 1, depth: 1 },
          rotation: 0 as const,
        };
        view.buildings = [building];
        world.set(view);
        selected.set(building.id);
        const machine = newMachine(kind, building.id, kind === 'extractor' ? 'scrap' : null);
        let tick = 0;

        const publish = (job: FactoryJob | null, stocked: boolean, blocked = false) => {
          machine.job = job;
          machine.status = blocked ? 'blocked' : job ? 'working' : 'idle';
          machine.requested = machine.allocated = job && !blocked ? 120 : 0;
          machine.output.slots = machine.output.slots.map((_, i) =>
            stocked
              ? {
                  item: kind === 'extractor' ? 'scrap' : ['plate', 'wire', 'scrap'][i % 3],
                  quantity: 100,
                }
              : null,
          );
          inspection.set({
            id: building.id,
            tick: ++tick,
            entity: {
              id: building.id,
              kind: 'building',
              building,
              machine: structuredClone(machine),
            },
          });
          world.update((current) => ({
            ...current!,
            factory: {
              ...current!.factory!,
              available: stocked ? 1000 : 999.9,
              requested: machine.requested,
              used: machine.allocated,
            },
          }));
        };

        publish(null, false);
        const fixture = TestBed.createComponent(FactoryPanelComponent);
        await fixture.whenStable();
        const root = fixture.nativeElement as HTMLElement;
        root.style.width = `${width}px`;
        root.style.height = '800px';
        const material = root.querySelector<HTMLSelectElement>('#factory-item')!;
        material.focus();

        const geometry = () => [
          root.querySelector('.machine-work')!.getBoundingClientRect().height,
          material.getBoundingClientRect().top,
          root.querySelector('#factory-wiring')!.getBoundingClientRect().top,
          [...root.querySelectorAll('button')]
            .find((b) => b.textContent?.trim() === 'Dismantle machine')!
            .getBoundingClientRect().top,
          root.scrollHeight,
        ];

        const baseline = geometry();
        const outcomes =
          kind === 'recycler' ? RECYCLER_OUTCOMES : [[{ item: 'scrap', quantity: 4 }]];
        for (const outputs of outcomes) {
          const job: FactoryJob = {
            recipe: kind === 'recycler' ? 'recycle-scrap' : 'extract-scrap',
            remaining: 1.9,
            inputs: kind === 'recycler' ? [{ item: 'scrap', quantity: 8 }] : [],
            outputs: outputs.map((s) => ({ ...s })),
            outputCommitted: false,
          };
          publish(job, false);
          await fixture.whenStable();
          expect(geometry()).toEqual(baseline);
          expect(getComputedStyle(root.querySelector('[data-machine-work]')!).visibility).toBe(
            'visible',
          );
          publish(null, true); // Between operations, with output appearing/stacking.
          await fixture.whenStable();
          expect(geometry()).toEqual(baseline);
          expect(getComputedStyle(root.querySelector('[data-machine-work]')!).visibility).toBe(
            'hidden',
          );
          publish({ ...job, remaining: 0, outputCommitted: kind === 'recycler' }, true, true);
          await fixture.whenStable();
          expect(geometry()).toEqual(baseline);
          expect(document.activeElement).toBe(material);
        }
        expect((await axe.run(root)).violations).toEqual([]);
        fixture.destroy();
      }
    },
  );
});
