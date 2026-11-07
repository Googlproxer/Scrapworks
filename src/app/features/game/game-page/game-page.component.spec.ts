import { clientNotifications, testInputPort } from '../../../../testing/game-ports';
import { Dialog } from '@angular/cdk/dialog';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ControlsComponent } from '@app/features/controls/controls/controls.component';
import type { GameClient, GameClientOptions } from '@game/client-api';
import type { GameState } from '@contracts/game-state';
import axe from 'axe-core';
import { BehaviorSubject, firstValueFrom, fromEvent } from 'rxjs';
import { GAME_CLIENT_LOADER } from '../game-client-factory';
import { GameRuntimeService } from '../game-runtime.service';
import { GamePageComponent } from './game-page.component';
import { AFTER_PAINT } from '../../../shared/loading/after-paint';
import { waitForSignal } from '../../../../testing/wait-for-state';

describe('GamePageComponent integration', () => {
  let fixture: ComponentFixture<GamePageComponent>;
  let runtime: GameRuntimeService;
  let client: GameClient & ReturnType<typeof clientNotifications>;
  let states: BehaviorSubject<GameState>;
  let factory: ReturnType<
    typeof vi.fn<(host: HTMLElement, options?: GameClientOptions) => GameClient>
  >;

  beforeEach(async () => {
    states = new BehaviorSubject<GameState>({
      phase: 'loading',
      sceneKey: 'MainMenu',
      errorMessage: null,
    });
    client = {
      ...clientNotifications(),
      input: testInputPort(),
      state$: states,
      toggleInspector: vi.fn(async () => undefined),
      setScene: vi.fn((sceneKey) =>
        states.next({ phase: 'loading', sceneKey, errorMessage: null }),
      ),
      destroy: vi.fn(),
      setInputEnabled: vi.fn(),
      setDebugDrawSettings: vi.fn(),
    };
    factory = vi.fn(() => client);
    await TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [
        { provide: GAME_CLIENT_LOADER, useValue: async () => factory },
        {
          provide: AFTER_PAINT,
          useValue: (work: () => void) => {
            work();
            return () => undefined;
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GamePageComponent);
    runtime = fixture.componentInstance.gameRuntimeService;
    (fixture.nativeElement as HTMLElement).style.cssText = 'width: 480px; height: 320px;';
    await fixture.whenStable();
    await waitForSignal(
      fixture.componentInstance.saves.status,
      (status) => status.phase !== 'checking',
      fixture.componentRef.injector,
    );
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    states.complete();
    vi.restoreAllMocks();
  });

  function button() {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((element) => element.textContent?.trim() === 'New Game');
  }

  it('exposes labelled debug switches with accessible native disclosure and category controls', async () => {
    client.debugDrawStatus$.next({
      available: true,
      categories: ['collision', 'placement', 'transforms'],
    });
    await fixture.whenStable();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('app-debug-draw-panel')!;
    expect(panel).not.toBeNull();
    const disclosure = panel.querySelector('details')!;
    disclosure.open = true;
    const inputs = panel.querySelectorAll('input');
    expect(inputs).toHaveLength(4);
    expect(inputs[0].checked).toBe(false);
    inputs[0].click();
    await fixture.whenStable();
    expect(client.setDebugDrawSettings).toHaveBeenCalledWith({
      enabled: true,
      disabledCategories: [],
    });
    inputs[1].click();
    await fixture.whenStable();
    expect(runtime.debugDrawSettings().disabledCategories).toEqual(['collision']);
    expect((await axe.run(panel)).violations).toEqual([]);
  });

  it('mounts into the page renderer host and destroys the client with the page', () => {
    const host = (fixture.nativeElement as HTMLElement).querySelector('.game-container');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(factory).toHaveBeenCalledExactlyOnceWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(host?.querySelector('canvas')).toBeNull();
    fixture.destroy();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('keeps Inspector close accessible while hiding the game HUD and restores its trigger focus', async () => {
    states.next({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    await fixture.whenStable();
    client.toggleInspector = vi.fn(async () => {
      if (runtime.inspectorActive()) {
        client.inspectorState$.next({ phase: 'closed', errorMessage: null });
        return;
      }
      client.inspectorState$.next({ phase: 'loading', errorMessage: null });
      client.inspectorState$.next({ phase: 'open', errorMessage: null });
    });
    const trigger = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === 'Inspector',
    )!;
    expect(trigger).toBeDefined();
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    expect(client.toggleInspector).toHaveBeenCalledOnce();
    expect(trigger.closest('[hidden]')).not.toBeNull();
    const close = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.inspector-close',
    )!;
    expect(close.closest('[hidden]')).toBeNull();
    close.focus();
    const restoredFocus = firstValueFrom(fromEvent(trigger, 'focus'));
    close.click();
    await fixture.whenStable();
    expect(trigger.closest('[hidden]')).toBeNull();
    await restoredFocus;
    expect(document.activeElement).toBe(trigger);
  });

  it('opens Controls through the page button and restores focus on close', async () => {
    states.next({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    await fixture.whenStable();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.top-right button',
    )!;
    const dialogs = TestBed.inject(Dialog);
    try {
      expect(client.setInputEnabled).toHaveBeenCalledExactlyOnceWith(true);
      trigger.focus();
      trigger.click();
      await fixture.whenStable();

      expect(dialogs.openDialogs).toHaveLength(1);
      const ref = dialogs.openDialogs[0];
      const overlay = ref.overlayRef.overlayElement;
      expect(ref.componentInstance).toBeInstanceOf(ControlsComponent);
      expect(ref.config.ariaLabelledBy).toBe('controls-title');
      expect(document.getElementById(ref.config.ariaLabelledBy!)?.textContent).toContain(
        'Controls',
      );
      expect(vi.mocked(client.setInputEnabled).mock.calls).toEqual([[true], [false]]);
      expect(overlay.contains(document.activeElement)).toBe(true);

      const accessibility = await axe.run(overlay);
      expect(
        accessibility.violations.map(({ id, nodes }) => ({
          id,
          elements: nodes.map((node) => node.html),
        })),
      ).toEqual([]);
      overlay.querySelector<HTMLButtonElement>('button[aria-label="Close controls"]')!.click();
      await fixture.whenStable();

      expect(dialogs.openDialogs).toHaveLength(0);
      expect(vi.mocked(client.setInputEnabled).mock.calls).toEqual([[true], [false], [true]]);
      expect(document.activeElement).toBe(trigger);
    } finally {
      dialogs.closeAll();
    }
  });

  it('closes the page-owned dialog when the page is destroyed', async () => {
    states.next({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    await fixture.whenStable();
    const dialogs = TestBed.inject(Dialog);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.top-right button')!
      .click();
    await fixture.whenStable();
    expect(dialogs.openDialogs).toHaveLength(1);
    const ref = dialogs.openDialogs[0];
    const overlay = ref.overlayRef.overlayElement;

    fixture.destroy();

    expect(dialogs.openDialogs).toHaveLength(0);
    expect(overlay.isConnected).toBe(false);
    expect(client.destroy).toHaveBeenCalledOnce();
    const calls = vi.mocked(client.setInputEnabled).mock.calls.slice();
    ref.close();
    expect(vi.mocked(client.setInputEnabled).mock.calls).toEqual(calls);
  });

  it('shares its scoped runtime and switches to Game through the actual Play Game button', async () => {
    expect(button()?.disabled).toBe(true);
    button()?.click();
    expect(client.setScene).not.toHaveBeenCalled();

    states.next({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    await fixture.whenStable();
    expect(button()?.disabled).toBe(false);
    button()?.click();
    button()?.click();
    await fixture.whenStable();
    expect(client.setScene).toHaveBeenCalledExactlyOnceWith('Game');
    expect(runtime.isLoading()).toBe(true);

    states.next({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    await fixture.whenStable();
    expect(runtime.currentSceneKey()).toBe('Game');
    expect(button()).toBeUndefined();
  });

  it('fills small and large hosts and keeps the Play Game control inside the viewport', async () => {
    states.next({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const host = page.querySelector<HTMLElement>('.game-container')!;
    for (const [width, height] of [
      [320, 240],
      [1280, 720],
    ]) {
      page.style.width = `${width}px`;
      page.style.height = `${height}px`;
      const bounds = host.getBoundingClientRect();
      expect(bounds.width).toBe(width);
      expect(bounds.height).toBe(height);
      const playBounds = button()!.getBoundingClientRect();
      expect(playBounds.left).toBeGreaterThanOrEqual(bounds.left);
      expect(playBounds.right).toBeLessThanOrEqual(bounds.right);
      expect(playBounds.bottom).toBeLessThanOrEqual(bounds.bottom);
    }
    expect(factory).toHaveBeenCalledOnce();
  });

  it('shows a renderer load failure and keeps Play Game unavailable', async () => {
    states.next({
      phase: 'error',
      sceneKey: 'MainMenu',
      errorMessage: 'Missing required scene asset',
    });
    await fixture.whenStable();
    expect(runtime.errorMessage()).toBe('Missing required scene asset');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Missing required scene asset');
    expect(button()).toBeUndefined();
    expect(runtime.isReady()).toBe(false);
  });

  it('closes page dialogs on a runtime error and focuses the accessible Retry action', async () => {
    states.next({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    await fixture.whenStable();
    fixture.componentInstance.inputAdapter.openMenu();
    await fixture.whenStable();
    expect(TestBed.inject(Dialog).openDialogs.length).toBe(1);
    states.next({
      phase: 'error',
      sceneKey: 'Game',
      errorMessage: 'Worker failed. Retry restarts this world.',
    });
    await fixture.whenStable();
    expect(TestBed.inject(Dialog).openDialogs.length).toBe(0);
    expect(document.activeElement).toBe(
      (fixture.nativeElement as HTMLElement).querySelector('[data-retry]'),
    );
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('shows the development focus indicator only while the viewport contains focus', () => {
    const page = fixture.nativeElement as HTMLElement;
    const host = page.querySelector<HTMLElement>('.game-container')!;
    const indicator = page.querySelector<HTMLElement>('#focus-indicator')!;
    states.next({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    fixture.detectChanges();
    expect(getComputedStyle(indicator).display).toBe('none');
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    host.append(canvas);

    canvas.focus();
    expect(document.activeElement).toBe(canvas);
    expect(getComputedStyle(indicator).display).toBe('block');

    page.querySelector<HTMLButtonElement>('.top-right button')!.focus();
    expect(getComputedStyle(indicator).display).toBe('none');
  });
});
