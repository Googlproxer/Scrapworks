import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { GameEvent } from '@contracts/game-events';
import { Boot } from '@game/scenes/boot.scene';
import type { Game } from 'phaser';
import { GameRuntimeService } from '../game-runtime.service';
import { PhaserGame } from './phaser-game.component';

describe('PhaserGame lifecycle', () => {
  const fixtures: ComponentFixture<PhaserGame>[] = [];
  const games = new Set<Game>();
  const runtimes = new Map<ComponentFixture<PhaserGame>, GameRuntimeService>();

  beforeEach(async () => {
    const init = Boot.prototype.init;
    vi.spyOn(Boot.prototype, 'init').mockImplementation(function (this: Boot) {
      games.add(this.game);
      init.call(this);
    });
    await TestBed.configureTestingModule({ imports: [PhaserGame] })
      .overrideComponent(PhaserGame, { add: { providers: [GameRuntimeService] } })
      .compileComponents();
  });

  afterEach(async () => {
    for (const fixture of fixtures) fixture.destroy();
    for (const game of games) await expect.poll(() => game.loop.running).toBe(false);
    fixtures.length = 0;
    games.clear();
    runtimes.clear();
    vi.restoreAllMocks();
  });

  function createHost() {
    const fixture = TestBed.createComponent(PhaserGame);
    fixtures.push(fixture);
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '480px';
    host.style.height = '320px';
    fixture.detectChanges();
    runtimes.set(fixture, fixture.debugElement.injector.get(GameRuntimeService));
    return fixture;
  }

  function runtime(fixture: ComponentFixture<PhaserGame>) {
    const service = runtimes.get(fixture);
    if (!service) throw new Error('The host runtime was not created.');
    return service;
  }

  function getMount(fixture: ComponentFixture<PhaserGame>) {
    const mount = (fixture.nativeElement as HTMLElement).querySelector<HTMLDivElement>('.game-container');
    if (!mount) throw new Error('The component did not render its game container.');
    return mount;
  }

  async function waitForGame(fixture: ComponentFixture<PhaserGame>) {
    await expect.poll(() => runtime(fixture).isReady() && runtime(fixture).currentSceneKey()).toBe('MainMenu');
    const game = [...games].find((game) => game.canvas.parentElement === getMount(fixture));
    if (!game) throw new Error('The host game did not start.');
    return game;
  }

  it('repeatedly recreates its game without retaining canvases, loops, or listeners', async () => {
    const originalCanvases = document.querySelectorAll('canvas').length;
    for (let cycle = 0; cycle < 3; cycle++) {
      const fixture = createHost();
      const game = await waitForGame(fixture);
      const mount = getMount(fixture);
      const canvas = game.canvas;
      expect(game.loop.running).toBe(true);
      expect(canvas.parentElement).toBe(mount);
      expect(mount.querySelectorAll('canvas')).toHaveLength(1);
      expect(document.querySelectorAll('canvas')).toHaveLength(originalCanvases + 1);
      expect(game.events.listenerCount(GameEvent.SCENE_READY)).toBe(1);
      expect(game.textures.exists('background')).toBe(true);
      expect(game.textures.exists('logo')).toBe(true);
      expect(game.textures.exists('player')).toBe(true);

      fixture.destroy();
      expect(runtime(fixture).state().phase).toBe('stopped');
      expect(game.events.listenerCount(GameEvent.SCENE_READY)).toBe(0);
      await expect.poll(() => game.loop.running).toBe(false);
      expect(canvas.parentElement).toBeNull();
      expect(canvas.isConnected).toBe(false);
      expect(mount.querySelectorAll('canvas')).toHaveLength(0);
      expect(document.querySelectorAll('canvas')).toHaveLength(originalCanvases);
    }
  });

  it('mounts simultaneous games into separate hosts and keeps their events independent', async () => {
    const first = createHost();
    const second = createHost();
    const firstGame = await waitForGame(first);
    const secondGame = await waitForGame(second);
    expect(firstGame).not.toBe(secondGame);
    expect(runtime(first)).not.toBe(runtime(second));
    expect(getMount(first).querySelectorAll('canvas')).toHaveLength(1);
    expect(getMount(second).querySelectorAll('canvas')).toHaveLength(1);
    runtime(first).setScene('Game');
    await expect.poll(() => runtime(first).isReady() && runtime(first).currentSceneKey()).toBe('Game');
    expect(firstGame.scene.getScenes(true).map((scene) => scene.scene.key)).toEqual(['Game']);
    expect(runtime(second).currentSceneKey()).toBe('MainMenu');
    first.destroy();
    await expect.poll(() => firstGame.loop.running).toBe(false);
    expect(secondGame.loop.running).toBe(true);
    expect(secondGame.canvas.parentElement).toBe(getMount(second));
    expect(secondGame.events.listenerCount(GameEvent.SCENE_READY)).toBe(1);
  });

  it('recreates a host immediately while the previous game is being destroyed', async () => {
    const previous = createHost();
    const previousGame = await waitForGame(previous);
    const previousMount = getMount(previous);
    const previousCanvas = previousGame.canvas;
    previous.destroy();
    const replacement = createHost();
    const replacementGame = await waitForGame(replacement);
    await expect.poll(() => previousGame.loop.running).toBe(false);
    expect(previousCanvas.parentElement).toBeNull();
    expect(previousMount.querySelectorAll('canvas')).toHaveLength(0);
    expect(runtime(previous).state().phase).toBe('stopped');
    expect(replacementGame).not.toBe(previousGame);
    expect(replacementGame.loop.running).toBe(true);
    expect(getMount(replacement).querySelectorAll('canvas')).toHaveLength(1);
    expect(runtime(replacement).isReady()).toBe(true);
  });
});
