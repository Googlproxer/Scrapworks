import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { Simulation } from '@simulation/ecs-runtime';
import { MemorySaveRepository } from '../../../../persistence/memory-save-repository';
import { worldFixture } from '../../../../../tests/support/world-fixture';
import { saveFixture } from '../../../../../tests/support/save-fixture';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { GAMEPLAY_SAVE_REPOSITORY, GameplaySaveService } from '../gameplay-save.service';
import { GameplaySavesComponent } from './gameplay-saves.component';
import { waitForSignal } from '../../../../testing/wait-for-state';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';

describe('Gameplay run history and backup controls', () => {
  async function setup() {
    const simulation = new Simulation(worldFixture());
    const view = signal(simulation.view),
      runId = signal('active-run');
    const repository = new MemorySaveRepository();
    const runtime = {
      world: view,
      runId,
      saveBinding: () => ({ runId: runId(), generation: 1, version: view().tick, pending: false }),
      holdForSave: () => () => undefined,
      holdForSaveConfirmation: () => () => undefined,
      captureForSave: async () => simulation.capture(),
      validateForSave: vi.fn(async (): Promise<void> => undefined),
      replaceForSave: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [GameplaySavesComponent],
      providers: [
        GameplaySaveService,
        { provide: GameRuntimeService, useValue: runtime },
        { provide: GAMEPLAY_SAVE_REPOSITORY, useValue: repository },
      ],
    });
    const fixture = TestBed.createComponent(GameplaySavesComponent);
    const saves = TestBed.inject(GameplaySaveService);
    await fixture.whenStable();
    await saves.refresh();
    await fixture.whenStable();
    return { fixture, saves, repository, runtime, view, simulation };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('names runs, inspects independent history and imports without activating, with accessible stable controls', async () => {
    const h = await setup();
    try {
      h.saves.runName.set({ name: 'Lake works' });
      await h.saves.save();
      const original = (await h.repository.load())!;
      h.saves.importName.set({ name: 'Backup copy' });
      await h.saves.inspectFile(
        new File([JSON.stringify(original)], 'backup.json', { type: 'application/json' }),
      );
      await h.saves.import();
      await h.fixture.whenStable();
      expect(h.saves.runs()).toHaveLength(2);
      expect(h.runtime.replaceForSave).not.toHaveBeenCalled();
      const element = h.fixture.nativeElement as HTMLElement;
      const select = element.querySelector<HTMLSelectElement>('[data-save-run]')!;
      select.value = original.runId;
      select.dispatchEvent(new Event('change'));
      await h.fixture.whenStable();
      expect(h.saves.status().slot?.token).toBe(original.token);
      const check = [...element.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Check saves again',
      )!;
      const before = check.getBoundingClientRect().top;
      await h.saves.inspectFile(new File(['{'], 'invalid.json'));
      await h.fixture.whenStable();
      expect(h.saves.status().phase).toBe('error');
      expect(check.getBoundingClientRect().top).toBe(before);
      expect((await axe.run(element)).violations).toEqual([]);
    } finally {
      h.fixture.destroy();
      h.simulation.dispose();
    }
  });

  it('rejects an oversized file before reading it and reports failed capability APIs without blocking backup', async () => {
    const h = await setup();
    try {
      const file = new File(['{}'], 'large.json');
      Object.defineProperty(file, 'size', { value: 97 * 1024 * 1024 });
      const read = vi.spyOn(file, 'text');
      await h.saves.inspectFile(file);
      expect(read).not.toHaveBeenCalled();
      expect(h.saves.status().message).toContain('too large');
      vi.spyOn(navigator.storage, 'estimate').mockRejectedValueOnce(new Error('Denied'));
      await h.saves.checkStorage();
      expect(h.saves.storageMessage()).toContain('check failed');
      expect(h.saves.busy()).toBe(false);
    } finally {
      h.fixture.destroy();
      h.simulation.dispose();
    }
  });

  it('shows unreadable revisions alongside usable history and requires confirmation before cleanup', async () => {
    const h = await setup();
    let damaged = true;
    try {
      await h.saves.save();
      const healthy = await h.repository.load();
      vi.spyOn(h.repository, 'catalog').mockImplementation(async () => ({
        revisions: await h.repository.list(),
        issues: damaged
          ? [{ id: 'broken', label: 'Revision broken', message: 'Unsupported save format.' }]
          : [],
      }));
      const remove = vi.spyOn(h.repository, 'deleteDamaged').mockImplementation(async () => {
        damaged = false;
      });
      await h.saves.refresh();
      await h.fixture.whenStable();
      const root = h.fixture.nativeElement as HTMLElement;
      expect(root.textContent).toContain('Unreadable saved revisions');
      expect(root.textContent).toContain('Unsupported save format.');
      expect(h.saves.history()).toHaveLength(1);
      expect((await axe.run(root)).violations).toEqual([]);
      const dialog = TestBed.inject(Dialog);
      let opened = firstValueFrom(dialog.afterOpened);
      let request = h.saves.deleteDamaged('broken');
      (await opened).close(false);
      await request;
      expect(remove).not.toHaveBeenCalled();
      opened = firstValueFrom(dialog.afterOpened);
      request = h.saves.deleteDamaged('broken');
      (await opened).close(true);
      await request;
      await h.fixture.whenStable();
      expect(remove).toHaveBeenCalledExactlyOnceWith('broken');
      expect(h.saves.status().issues).toEqual([]);
      expect(await h.repository.load()).toEqual(healthy);
    } finally {
      h.fixture.destroy();
      h.simulation.dispose();
    }
  });

  it.each([
    {
      description: 'restores file chooser focus after validation re-enables the save controls',
      moveFocus: false,
    },
    {
      description: 'preserves focus moved to another control during backup validation',
      moveFocus: true,
    },
  ])('$description', async ({ moveFocus }) => {
    const h = await setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    h.runtime.validateForSave.mockImplementationOnce(() => gate);
    try {
      const element = h.fixture.nativeElement as HTMLElement;
      const input = element.querySelector<HTMLInputElement>('[data-save-import]')!;
      input.focus();
      const inspecting = h.saves.inspectFile(
        new File([JSON.stringify(saveFixture(h.simulation.capture()))], 'backup.json'),
      );
      await waitForSignal(
        h.saves.status,
        (s) => s.phase === 'importing',
        h.fixture.componentRef.injector,
      );
      await h.fixture.whenStable();
      expect(input.matches(':disabled')).toBe(true);
      expect(document.activeElement).toBe(document.body);
      const expectedFocus = moveFocus ? element.querySelector<HTMLElement>('.status')! : input;
      if (moveFocus) expectedFocus.focus();
      finish();
      await inspecting;
      await h.fixture.whenStable();
      expect(h.saves.status().inspected).not.toBeNull();
      expect(input.matches(':disabled')).toBe(false);
      expect(document.activeElement).toBe(expectedFocus);
    } finally {
      finish();
      h.fixture.destroy();
      h.simulation.dispose();
    }
  });

  it('autosaves completed active ticks without disabling or moving a focused field', async () => {
    const h = await setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const write = h.repository.save.bind(h.repository);
    vi.spyOn(h.repository, 'save').mockImplementationOnce(async (...args) => {
      await gate;
      return write(...args);
    });
    try {
      const input = (h.fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '[data-save-run-name]',
      )!;
      input.focus();
      const top = input.getBoundingClientRect().top;
      // A paused or hidden world publishes the same completed tick and contributes zero time.
      h.view.set({ ...h.view() });
      await h.fixture.whenStable();
      expect(await h.repository.list()).toEqual([]);
      h.view.set({ ...h.view(), tick: 2400 });
      await h.fixture.whenStable();
      await waitForSignal(
        h.saves.status,
        (s) => s.phase === 'saving',
        h.fixture.componentRef.injector,
      );
      expect(document.activeElement).toBe(input);
      expect(input.matches(':disabled')).toBe(false);
      expect(input.getBoundingClientRect().top).toBe(top);
      finish();
      await waitForSignal(
        h.saves.status,
        (s) => s.message === 'Autosave committed.',
        h.fixture.componentRef.injector,
      );
      expect((await h.repository.load())?.kind).toBe('auto');
      expect((await h.repository.list()).some((m) => m.kind === 'manual')).toBe(false);
    } finally {
      finish();
      h.fixture.destroy();
      h.simulation.dispose();
    }
  });

  it('a late file read cannot replace a newer inspection', async () => {
    const h = await setup();
    try {
      const valid = saveFixture(h.simulation.capture());
      let finish!: (text: string) => void;
      const file = new File([], 'slow.json');
      vi.spyOn(file, 'text').mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const slow = h.saves.inspectFile(file);
      await h.saves.inspectFile(new File(['{'], 'newer-invalid.json'));
      finish(JSON.stringify(valid));
      await slow;
      expect(h.saves.status().inspected).toBeNull();
      expect(h.saves.status().message).toContain('not valid JSON');
    } finally {
      h.fixture.destroy();
      h.simulation.dispose();
    }
  });
});
