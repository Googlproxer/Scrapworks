import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { GameClient } from '@contracts/game-client';
import { GameEvent } from '@contracts/game-events';
import { Boot } from '@game/scenes/boot.scene';
import { MainMenu } from '@game/scenes/main-menu.scene';
import type { Game } from 'phaser';
import { GAME_CLIENT_FACTORY } from '../game-client-factory';
import { GameRuntimeService } from '../game-runtime.service';
import { GamePageComponent } from './game-page.component';

describe('GamePageComponent integration', () => {
  let component: GamePageComponent;
  let fixture: ComponentFixture<GamePageComponent>;
  let runtime: GameRuntimeService;
  let client: GameClient;
  let factory: ReturnType<typeof vi.fn<(host: HTMLElement) => GameClient>>;
  const games = new Set<Game>();

  beforeEach(async () => {
    const init = Boot.prototype.init;
    vi.spyOn(Boot.prototype, 'init').mockImplementation(function (this: Boot) {
      games.add(this.game);
      init.call(this);
    });
    client = { subscribe: vi.fn(() => () => undefined), setScene: vi.fn(), destroy: vi.fn(), setInputEnabled: vi.fn() };
    factory = vi.fn(() => client);
    await TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [GameRuntimeService, { provide: GAME_CLIENT_FACTORY, useValue: factory }],
    }).compileComponents();
    fixture = TestBed.createComponent(GamePageComponent);
    component = fixture.componentInstance;
    runtime = fixture.componentInstance.gameRuntimeService;
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '480px';
    host.style.height = '320px';
  });

  afterEach(async () => {
    fixture.destroy();
    for (const game of games) await expect.poll(() => game.loop.running).toBe(false);
    games.clear();
    vi.restoreAllMocks();
  });

  function button() {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === 'Play Game!',
    );
  }

  async function waitForMenu() {
    await expect.poll(() => runtime.isReady() && runtime.currentSceneKey()).toBe('MainMenu');
    fixture.detectChanges();
    const game = [...games][0];
    if (!game) throw new Error('The page game did not start.');
    return game;
  }

  it('mounts into a renderer-neutral host and destroys the client with the viewport', () => {
    expect(component).toBeTruthy();
    const host = (fixture.nativeElement as HTMLElement).querySelector('.game-container');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(factory).toHaveBeenCalledExactlyOnceWith(host);
    expect(host?.querySelector('canvas')).toBeNull();
    fixture.destroy();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('shares a scoped runtime and switches to Game through the actual Play Game button', async () => {
    fixture.detectChanges();
    expect(button()?.disabled).toBe(true);
    button()?.click();
    expect(runtime.currentSceneKey()).not.toBe('Game');
    const game = await waitForMenu();
    expect(button()?.disabled).toBe(false);
    button()?.click();
    button()?.click();
    await expect.poll(() => runtime.isReady() && runtime.currentSceneKey()).toBe('Game');
    fixture.detectChanges();
    expect(button()).toBeUndefined();
    expect(game.scene.getScenes(true).map((scene) => scene.scene.key)).toEqual(['Game']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('canvas')).toHaveLength(1);
  });

  it('fills small and large hosts and preserves scene layout on resize', async () => {
    fixture.detectChanges();
    const game = await waitForMenu();
    const host = fixture.nativeElement as HTMLElement;
    for (const [width, height] of [
      [320, 240],
      [1280, 720],
    ]) {
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      window.dispatchEvent(new Event('resize'));
      await expect.poll(() => game.scale.width).toBe(width);
      await expect.poll(() => game.scale.height).toBe(height);
      const bounds = game.canvas.getBoundingClientRect();
      expect(bounds.width).toBe(width);
      expect(bounds.height).toBe(height);
      const playBounds = button()!.getBoundingClientRect();
      expect(playBounds.left).toBeGreaterThanOrEqual(bounds.left);
      expect(playBounds.right).toBeLessThanOrEqual(bounds.right);
      expect(playBounds.bottom).toBeLessThanOrEqual(bounds.bottom);
      const menu = game.scene.getScene('MainMenu') as MainMenu;
      expect(menu.logo?.x).toBe(width / 2);
      expect(menu.logo?.y).toBe(height / 2);
      expect(menu.logo!.displayWidth).toBeLessThanOrEqual(width - 48);
    }
  });

  it('reports a required asset failure and keeps Play Game unavailable', async () => {
    vi.spyOn(Boot.prototype, 'preload').mockImplementation(function (this: Boot) {
      this.load.image('missing-required-asset', 'assets/missing-required-asset.png');
    });
    fixture.detectChanges();
    await expect.poll(() => runtime.state().phase).toBe('error');
    fixture.detectChanges();
    expect(runtime.errorMessage()).toContain('missing-required-asset');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('missing-required-asset');
    expect(button()).toBeUndefined();
    expect(runtime.isReady()).toBe(false);
    const game = [...games][0];
    game.events.emit(GameEvent.SCENE_READY, { sceneKey: 'MainMenu' });
    expect(runtime.state().phase).toBe('error');
    expect(game.scene.isActive('MainMenu')).toBe(false);
  });
});
