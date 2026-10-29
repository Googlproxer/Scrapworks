import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { loadEditorScene } from '@game/assets/load-editor-scene';
import { BabylonGameClient } from '@game/babylon-game-client';
import type { GameClientOptions } from '@contracts/game-client';
import axe from 'axe-core';
import { GAME_CLIENT_FACTORY } from '../game-client-factory';
import { GamePageComponent } from './game-page.component';
import { SIMULATION_PORT_FACTORY } from '../simulation-port-factory';
import { InlineSimulationPort } from '../../../../session/inline-port';

describe('Babylon game page integration', () => {
  let fixture: ComponentFixture<GamePageComponent>;
  let loadSceneFn: ReturnType<typeof vi.fn<typeof loadEditorScene>>;

  beforeEach(async () => {
    loadSceneFn = vi.fn(loadEditorScene);
    await TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [
        // Angular's unit-test bundler does not compile module worker URL entries.
        // The built application/worker is exercised by tools/world/production-browser.mjs.
        { provide: SIMULATION_PORT_FACTORY, useValue: () => new InlineSimulationPort() },
        {
          provide: GAME_CLIENT_FACTORY,
          useValue: (host: HTMLElement, options: GameClientOptions) =>
            new BabylonGameClient(host, loadSceneFn, options),
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GamePageComponent);
    (fixture.nativeElement as HTMLElement).style.cssText = 'width: 480px; height: 320px;';
    // The real page is inside App's main landmark.
    (fixture.nativeElement as HTMLElement).setAttribute('role', 'main');
    fixture.detectChanges();
    await expect
      .poll(() => fixture.componentInstance.gameRuntimeService.isReady(), { timeout: 30_000 })
      .toBe(true);
    fixture.detectChanges();
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

  async function expectAccessible() {
    const results = await axe.run(fixture.nativeElement as HTMLElement);
    expect(
      results.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) })),
    ).toEqual([]);
  }

  it('enters the loaded 3D scene through Play Game and releases its renderer on page destruction', async () => {
    const runtime = fixture.componentInstance.gameRuntimeService;
    const engine = EngineStore.LastCreatedEngine!;
    await expectAccessible();
    button('Play Game!')!.click();
    expect(runtime.isLoading()).toBe(true);
    await expect.poll(() => runtime.state().phase, { timeout: 30000 }).not.toBe('loading');
    expect(runtime.errorMessage()).toBeNull();
    expect(runtime.isReady()).toBe(true);
    expect(runtime.currentSceneKey()).toBe('Game');
    fixture.detectChanges();
    expect(button('Play Game!')).toBeUndefined();
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
    button('Play Game!')!.click();
    await expect.poll(() => runtime.state().phase, { timeout: 30_000 }).toBe('error');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('missing-game.babylon');
    expect(button('Play Game!')).toBeUndefined();
    await expectAccessible();
    button('Retry')!.click();
    await expect.poll(() => runtime.isReady(), { timeout: 30_000 }).toBe(true);
    fixture.detectChanges();
    expect(previousEngine.isDisposed).toBe(true);
    expect(EngineStore.LastCreatedEngine).not.toBe(previousEngine);
    expect(runtime.currentSceneKey()).toBe('MainMenu');
    expect(button('Play Game!')?.disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('canvas')).toHaveLength(1);
    await expectAccessible();
  });
});
