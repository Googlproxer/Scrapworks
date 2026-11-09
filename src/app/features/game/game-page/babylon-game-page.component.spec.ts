import { saveFixture } from '../../../../../tests/support/save-fixture.ts';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { loadEditorScene } from '@game/assets/load-editor-scene';
import { BabylonGameClient } from '@game/babylon-game-client';
import type { GameClientOptions } from '@game/client-api';
import axe from 'axe-core';
import { GAME_CLIENT_LOADER } from '../game-client-factory';
import { GamePageComponent } from './game-page.component';
import { SIMULATION_PORT_FACTORY } from '../simulation-port-factory';
import { InlineSimulationPort } from '../../../../../tools/testing/inline-simulation-port';
import { waitForSignal } from '../../../../testing/wait-for-state';
import type { GameState } from '@contracts/game-state';
import { GameplaySaveService, GAMEPLAY_SAVE_REPOSITORY } from '../../save/gameplay-save.service';
import { MemorySaveRepository } from '../../../../persistence/memory-save-repository';
import { Simulation } from '@simulation/ecs-runtime';
import { OPENING_TECHNOLOGIES } from '@content/opening';
import type { SaveSnapshot } from '@contracts/save';
import { Dialog } from '@angular/cdk/dialog';
import { fromBabylonObservable } from '@game/lifecycle/from-babylon-observable';
import { lastValueFrom, take } from 'rxjs';

describe('Babylon game page integration', () => {
  let fixture: ComponentFixture<GamePageComponent>;
  let loadSceneFn: ReturnType<typeof vi.fn<typeof loadEditorScene>>;

  beforeEach(async () => {
    loadSceneFn = vi.fn(loadEditorScene);
    await TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [
        // Angular's unit-test bundler does not compile module worker URL entries.
        // The built application/worker is exercised by tests/acceptance/production-browser.ts.
        { provide: SIMULATION_PORT_FACTORY, useValue: () => new InlineSimulationPort() },
        {
          provide: GAME_CLIENT_LOADER,
          useValue: async () => (host: HTMLElement, options: GameClientOptions) =>
            new BabylonGameClient(host, loadSceneFn, options),
        },
      ],
    })
      .overrideComponent(GamePageComponent, {
        add: {
          providers: [
            { provide: GAMEPLAY_SAVE_REPOSITORY, useFactory: () => new MemorySaveRepository() },
          ],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(GamePageComponent);
    (fixture.nativeElement as HTMLElement).style.cssText = 'width: 480px; height: 320px;';
    // The real page is inside App's main landmark.
    (fixture.nativeElement as HTMLElement).setAttribute('role', 'main');
    fixture.detectChanges();
    await waitForState('MainMenu', 'ready');
    await waitForSignal(
      fixture.componentInstance.saves.status,
      (status) => status.phase !== 'checking',
      fixture.componentRef.injector,
    );
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function button(label: string) {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((element) => element.textContent?.trim() === label);
  }

  async function waitForState(sceneKey: GameState['sceneKey'], phase: GameState['phase']) {
    await waitForSignal(
      fixture.componentInstance.gameRuntimeService.state,
      (state) => state.sceneKey === sceneKey && state.phase === phase,
      fixture.componentRef.injector,
    );
    await fixture.whenStable();
  }

  async function expectAccessible() {
    const results = await axe.run(fixture.nativeElement as HTMLElement);
    expect(
      results.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) })),
    ).toEqual([]);
  }

  async function seedHandcraft(): Promise<SaveSnapshot> {
    const response = await fetch('/scene/worlds/game.json');
    const initial = new Simulation(await response.json());
    const snapshot = initial.capture();
    initial.dispose();
    for (const technology of OPENING_TECHNOLOGIES)
      snapshot.resources.research[technology.id] = {
        consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
        work: technology.seconds,
        unlocked: true,
      };
    const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
    for (const [i, [item, quantity]] of (
      [
        ['plate', 2],
        ['wire', 2],
        ['mechanical-part', 1],
        ['electrical-part', 1],
      ] as const
    ).entries())
      player.inventory!.slots[i] = { item, quantity };
    const prepared = new Simulation(snapshot.definition, { snapshot });
    prepared.step({ x: 0, z: 0, sprint: false }, [
      { type: 'handcraft-ui', visible: true },
      { type: 'craft', recipe: 'base-minifab', quantity: 1 },
    ]);
    const world = prepared.capture();
    prepared.dispose();
    const save: SaveSnapshot = saveFixture(
      world,
      crypto.randomUUID(),
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    await fixture.componentRef.injector.get(GAMEPLAY_SAVE_REPOSITORY).save(save, null);
    await fixture.componentRef.injector.get(GameplaySaveService).refresh();
    await fixture.whenStable();
    return save;
  }

  it('prepares a saved world from the menu, shows its crafting panel and preserves the live job during Save', async () => {
    const save = await seedHandcraft(),
      saves = fixture.componentRef.injector.get(GameplaySaveService),
      runtime = fixture.componentInstance.gameRuntimeService;
    const previous = EngineStore.LastCreatedEngine!.scenes[0];
    await saves.load();
    await fixture.whenStable();
    expect(runtime.runId()).toBe(save.runId);
    expect(previous.isDisposed).toBe(true);
    expect(runtime.world()!.opening!.state.handcraft?.recipe).toBe('base-minifab');
    expect(runtime.fieldKitOpen()).toBe(true);
    expect(document.activeElement?.id).toBe('field-kit-title');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#recipe')!.value,
    ).toBe('base-minifab');
    await saves.save();
    const committed = await fixture.componentRef.injector.get(GAMEPLAY_SAVE_REPOSITORY).load();
    expect(
      committed!.world.entities.find((entity) => entity.kind === 'player')!.opening!.handcraft,
    ).not.toBeNull();
    expect(runtime.world()!.productionTotals['minifab'] ?? 0).toBe(0);
    await expectAccessible();
  }, 45000);

  it('keeps a healthy scene, protected craft and native world intact when candidate presentation fails', async () => {
    await seedHandcraft();
    const saves = fixture.componentRef.injector.get(GameplaySaveService),
      runtime = fixture.componentInstance.gameRuntimeService;
    await saves.load();
    const release = runtime.holdForSave();
    try {
      const before = await runtime.captureForSave(),
        scene = EngineStore.LastCreatedEngine!.scenes[0];
      loadSceneFn.mockRejectedValueOnce(new Error('Injected presentation failure'));
      const pending = saves.load();
      await fixture.whenStable();
      TestBed.inject(Dialog).openDialogs.at(-1)?.close(true);
      await pending;
      expect(saves.status().message).toContain('Injected presentation failure');
      expect(await runtime.captureForSave()).toEqual(before);
      expect(scene.isDisposed).toBe(false);
      expect(EngineStore.LastCreatedEngine!.scenes).toHaveLength(1);
      expect(runtime.fieldKitOpen()).toBe(true);
    } finally {
      release();
    }
  }, 45000);

  it('restores saved handcraft into the pause menu without advancing it, then resumes visibly', async () => {
    await seedHandcraft();
    const saves = fixture.componentRef.injector.get(GameplaySaveService),
      runtime = fixture.componentInstance.gameRuntimeService;
    button('New Game')!.click();
    await waitForState('Game', 'ready');
    fixture.componentInstance.inputAdapter.openMenu();
    await fixture.whenStable();
    const pending = saves.load();
    await fixture.whenStable();
    TestBed.inject(Dialog).openDialogs.at(-1)?.close(true);
    await pending;
    await fixture.whenStable();
    const before = await runtime.captureForSave();
    await lastValueFrom(
      fromBabylonObservable(EngineStore.LastCreatedEngine!.onEndFrameObservable).pipe(take(3)),
    );
    expect(
      (await runtime.captureForSave()).entities.find((entity) => entity.kind === 'player')!.opening!
        .handcraft,
    ).toEqual(before.entities.find((entity) => entity.kind === 'player')!.opening!.handcraft);
    const menu = TestBed.inject(Dialog).openDialogs.find((ref) =>
      ref.overlayRef.overlayElement.textContent?.includes('Resume game'),
    )!;
    menu.overlayRef.overlayElement.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(runtime.fieldKitOpen()).toBe(true);
    expect(runtime.world()!.opening!.state.handcraft).not.toBeNull();
  }, 45000);

  it('enters the loaded 3D scene through Play Game and releases its renderer on page destruction', async () => {
    const runtime = fixture.componentInstance.gameRuntimeService;
    const engine = EngineStore.LastCreatedEngine!;
    await expectAccessible();
    button('New Game')!.click();
    await fixture.whenStable();
    expect(runtime.isLoading()).toBe(true);
    await waitForState('Game', 'ready');
    expect(runtime.errorMessage()).toBeNull();
    expect(runtime.isReady()).toBe(true);
    expect(runtime.currentSceneKey()).toBe('Game');
    fixture.detectChanges();
    expect(button('New Game')).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('canvas')).toHaveLength(1);
    expect(engine.scenes[0].skeletons).toHaveLength(1);
    await expectAccessible();
    fixture.destroy();
    expect(engine.isDisposed).toBe(true);
    expect(engine.activeRenderLoops).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas')).toBeNull();
  }, 45000);

  it('shows a load error and remounts through Retry before allowing Play Game again', async () => {
    const runtime = fixture.componentInstance.gameRuntimeService;
    const previousEngine = EngineStore.LastCreatedEngine!;
    loadSceneFn.mockImplementationOnce((scene) =>
      LoadAssetContainerAsync('/scene/missing-game.babylon', scene),
    );
    button('New Game')!.click();
    await waitForState('Game', 'error');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('missing-game.babylon');
    expect(button('New Game')).toBeUndefined();
    await expectAccessible();
    button('Retry')!.click();
    await waitForState('MainMenu', 'ready');
    fixture.detectChanges();
    expect(previousEngine.isDisposed).toBe(true);
    expect(EngineStore.LastCreatedEngine).not.toBe(previousEngine);
    expect(runtime.currentSceneKey()).toBe('MainMenu');
    expect(button('New Game')?.disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('canvas')).toHaveLength(1);
    await expectAccessible();
  });
});
