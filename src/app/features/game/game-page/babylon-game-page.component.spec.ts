import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { loadPlayer } from '@game/babylon/assets/load-player';
import { BabylonGameClient } from '@game/babylon/babylon-game-client';
import axe from 'axe-core';
import { GAME_CLIENT_FACTORY } from '../game-client-factory';
import { GamePageComponent } from './game-page.component';

describe('Babylon game page integration', () => {
  let fixture: ComponentFixture<GamePageComponent>;
  let loadPlayerFn: ReturnType<typeof vi.fn<typeof loadPlayer>>;

  beforeEach(async () => {
    loadPlayerFn = vi.fn(loadPlayer);
    await TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [{ provide: GAME_CLIENT_FACTORY, useValue: (host: HTMLElement) => new BabylonGameClient(host, loadPlayerFn) }],
    }).compileComponents();
    fixture = TestBed.createComponent(GamePageComponent);
    (fixture.nativeElement as HTMLElement).style.cssText = 'width: 480px; height: 320px;';
    // The real page is inside App's main landmark.
    (fixture.nativeElement as HTMLElement).setAttribute('role', 'main');
    fixture.detectChanges();
    await expect.poll(() => fixture.componentInstance.gameRuntimeService.isReady()).toBe(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function button(label: string) {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label);
  }

  async function expectAccessible() {
    const results = await axe.run(fixture.nativeElement as HTMLElement);
    expect(results.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) }))).toEqual([]);
  }

  it('enters the loaded 3D scene through Play Game and releases its renderer on page destruction', async () => {
    const runtime = fixture.componentInstance.gameRuntimeService;
    const engine = EngineStore.LastCreatedEngine!;
    await expectAccessible();
    button('Play Game!')!.click();
    expect(runtime.isLoading()).toBe(true);
    await expect.poll(() => runtime.isReady(), { timeout: 30000 }).toBe(true);
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
  });

  it('shows a load error and remounts through Retry before allowing Play Game again', async () => {
    const runtime = fixture.componentInstance.gameRuntimeService;
    const previousEngine = EngineStore.LastCreatedEngine!;
    loadPlayerFn.mockImplementationOnce((scene) => LoadAssetContainerAsync('/assets/models/missing-protagonist.glb', scene));
    button('Play Game!')!.click();
    await expect.poll(() => runtime.state().phase).toBe('error');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('missing-protagonist.glb');
    expect(button('Play Game!')).toBeUndefined();
    await expectAccessible();
    button('Retry')!.click();
    await expect.poll(() => runtime.isReady()).toBe(true);
    fixture.detectChanges();
    expect(previousEngine.isDisposed).toBe(true);
    expect(EngineStore.LastCreatedEngine).not.toBe(previousEngine);
    expect(runtime.currentSceneKey()).toBe('MainMenu');
    expect(button('Play Game!')?.disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('canvas')).toHaveLength(1);
    await expectAccessible();
  });
});
