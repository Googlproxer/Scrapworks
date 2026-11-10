import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import axe from 'axe-core';
import { defaultProfile, type ActionFrame } from '@contracts/input';
import type { GameClient, GameClientOptions } from '@game/client-api';
import { clientNotifications, testInputPort } from '../../../../testing/game-ports';
import { InlineSimulationPort } from '../../../../../tools/testing/inline-simulation-port';
import { worldFixture } from '../../../../../tests/support/world-fixture';
import { saveFixture } from '../../../../../tests/support/save-fixture';
import { Simulation } from '@simulation/ecs-runtime';
import { OPENING_TECHNOLOGIES } from '@content/opening';
import { MemorySaveRepository } from '../../../../persistence/memory-save-repository';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { GAME_CLIENT_LOADER } from '../../game/game-client-factory';
import { SIMULATION_PORT_FACTORY } from '../../game/simulation-port-factory';
import { ControlSettingsService } from '../../controls/control-settings.service';
import { AFTER_PAINT } from '../../../shared/loading/after-paint';
import { UiInputAdapterService } from '../../ui/ui-input-adapter.service';
import { UiService } from '../../ui/ui.service';
import { UiDialogRegistry } from '../../ui/ui-dialog-registry';
import { GameplaySaveService, GAMEPLAY_SAVE_REPOSITORY } from '../gameplay-save.service';

@Component({
  selector: 'app-save-test-page',
  template: '<button type="button">Page action</button>',
})
class TestPage {}

@Component({
  selector: 'app-save-test-menu',
  template: '<button type="button">Menu action</button>',
})
class TestMenu {}

describe('Controller save confirmation integration', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function setup(work = true) {
    const definition = worldFixture();
    const initial = new Simulation(definition);
    const seed = initial.capture();
    initial.dispose();
    for (const technology of OPENING_TECHNOLOGIES)
      seed.resources.research[technology.id] = {
        unlocked: true,
        work: technology.seconds,
        consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      };
    seed.entities.find((entity) => entity.kind === 'player')!.inventory!.slots[0] = {
      item: 'scrap',
      quantity: 20,
    };
    const source = new Simulation(definition, { snapshot: seed });
    if (work)
      source.step({ x: 0, z: 0, sprint: false }, [
        { type: 'handcraft-ui', visible: true },
        { type: 'craft', recipe: 'metal-plate', quantity: 3 },
      ]);
    const save = saveFixture(source.capture());
    source.dispose();
    const repository = new MemorySaveRepository();
    await repository.save(save, null);
    const notices = clientNotifications();
    let options!: GameClientOptions;
    const setContext = vi.fn();
    const client: GameClient = {
      ...notices,
      input: { ...testInputPort(), setContext },
      destroy: () => undefined,
      setScene: () => undefined,
      setInputEnabled: () => undefined,
      setDebugDrawSettings: () => undefined,
      toggleInspector: async () => undefined,
      prepareWorld: async () => ({
        commit: () => notices.state$.next({ phase: 'ready', sceneKey: 'Game', errorMessage: null }),
        dispose: () => undefined,
      }),
    };
    TestBed.configureTestingModule({
      imports: [TestPage, TestMenu],
      providers: [
        GameRuntimeService,
        GameplaySaveService,
        UiService,
        UiInputAdapterService,
        { provide: GAMEPLAY_SAVE_REPOSITORY, useValue: repository },
        {
          provide: ControlSettingsService,
          useValue: { profile: signal(structuredClone(defaultProfile)) },
        },
        { provide: SIMULATION_PORT_FACTORY, useValue: () => new InlineSimulationPort() },
        {
          provide: AFTER_PAINT,
          useValue: (callback: () => void) => {
            callback();
            return () => undefined;
          },
        },
        {
          provide: GAME_CLIENT_LOADER,
          useValue: async () => (_host: HTMLElement, value: GameClientOptions) => {
            options = value;
            return client;
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(TestPage);
    const runtime = TestBed.inject(GameRuntimeService);
    runtime.mount(fixture.nativeElement);
    await Promise.resolve();
    await options.session.initialize(definition);
    notices.state$.next({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify(definition)),
    );
    await runtime.replaceForSave(save, async () => undefined);
    const adapter = TestBed.inject(UiInputAdapterService);
    adapter.attach(fixture.nativeElement);
    const saves = TestBed.inject(GameplaySaveService);
    await saves.refresh();
    await fixture.whenStable();

    const dispatch = (states: ActionFrame['states']) =>
      options.actions.dispatch({ context: 'ui', revision: 1, states });

    const press = (action: string) =>
      dispatch({ [action]: { kind: 'button', held: true, pressed: true, released: false } });

    return {
      fixture,
      runtime,
      saves,
      repository,
      options,
      press,
      dispatch,
      setContext,
      dialog: TestBed.inject(Dialog),
    };
  }

  it.each(['load', 'newGame'] as const)(
    'allows controller navigation and cancellation of %s while preserving invested work',
    async (operation) => {
      const h = await setup();
      const before = await h.runtime.captureForSave();
      const opened = firstValueFrom(h.dialog.afterOpened);
      const request = h.saves[operation]();
      const ref = await opened;
      await h.fixture.whenStable();
      expect(h.setContext).toHaveBeenLastCalledWith('ui');
      expect(TestBed.inject(UiDialogRegistry).activeElement).toBe(ref.overlayRef.overlayElement);
      h.options.session.frame(0.25, { x: 1, z: 0 }, true, true);
      h.options.session.completeFrame();
      expect(h.runtime.command({ type: 'handcraft-ui', visible: false }).status).toBe(
        'unavailable',
      );
      const buttons = ref.overlayRef.overlayElement.querySelectorAll<HTMLButtonElement>('button');
      buttons[0].focus();
      h.dispatch({ navigate: { kind: 'vector2', value: { x: 1, y: 0 } } });
      expect(document.activeElement).toBe(buttons[1]);
      expect((await axe.run(ref.overlayRef.overlayElement)).violations).toEqual([]);
      h.press('cancel');
      await request;
      expect(h.dialog.openDialogs).toHaveLength(0);
      expect(await h.runtime.captureForSave()).toEqual(before);
      expect(h.saves.status().message).toBe('Operation canceled.');
    },
  );

  it('confirms deletion through controller Submit without advancing or refunding the active world', async () => {
    const h = await setup();
    const before = await h.runtime.captureForSave();
    const opened = firstValueFrom(h.dialog.afterOpened);
    const request = h.saves.delete();
    const ref = await opened;
    await h.fixture.whenStable();
    const buttons = ref.overlayRef.overlayElement.querySelectorAll<HTMLButtonElement>('button');
    buttons[0].focus();
    h.dispatch({ navigate: { kind: 'vector2', value: { x: 1, y: 0 } } });
    h.press('submit');
    await request;
    expect(await h.repository.list()).toEqual([]);
    expect(await h.runtime.captureForSave()).toEqual(before);
  });

  it('targets a save prompt above an existing menu and restores its prior pause and focus', async () => {
    const h = await setup(false);
    const ui = TestBed.inject(UiService);
    ui.openUIDialog('game-menu', TestMenu);
    await h.fixture.whenStable();
    const menu = h.dialog.openDialogs[0];
    const menuButton = menu.overlayRef.overlayElement.querySelector<HTMLButtonElement>('button')!;
    menuButton.focus();
    const before = await h.runtime.captureForSave();
    const opened = firstValueFrom(h.dialog.afterOpened);
    const request = h.saves.deleteLegacy();
    const ref = await opened;
    await h.fixture.whenStable();
    expect(TestBed.inject(UiDialogRegistry).activeElement).toBe(ref.overlayRef.overlayElement);
    h.press('cancel');
    await request;
    await TestBed.inject(ApplicationRef).whenStable();
    expect(h.dialog.openDialogs).toEqual([menu]);
    expect(TestBed.inject(UiDialogRegistry).activeElement).toBe(menu.overlayRef.overlayElement);
    expect(document.activeElement).toBe(menuButton);
    expect(h.options.session.isSimulationActive()).toBe(false);
    expect(await h.runtime.captureForSave()).toEqual(before);
  });
});
