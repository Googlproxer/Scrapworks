import { DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  defaultProfile,
  type BindingProfile,
  type ButtonControl,
  type ControllerInfo,
} from '@contracts/input';
import axe from 'axe-core';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { ControlSettingsService } from '../control-settings.service';
import { ControlsComponent } from './controls.component';

describe('ControlsComponent editing', () => {
  let fixture: ComponentFixture<ControlsComponent>;
  let component: ControlsComponent;
  let settings: {
    profile: ReturnType<typeof signal<BindingProfile>>;
    error: ReturnType<typeof signal<string | null>>;
    ready: Promise<void>;
    save: ReturnType<typeof vi.fn>;
  };
  let runtime: {
    controllers: ReturnType<typeof signal<readonly ControllerInfo[]>>;
    selectedController: ReturnType<typeof signal<string | null>>;
    captureBinding: ReturnType<typeof vi.fn>;
    selectController: ReturnType<typeof vi.fn>;
  };
  let close: ReturnType<typeof vi.fn>;
  let stopCapture: ReturnType<typeof vi.fn>;
  let captureListener: (control: ButtonControl) => void;

  beforeEach(async () => {
    settings = {
      profile: signal<BindingProfile>(structuredClone(defaultProfile)),
      error: signal<string | null>(null),
      ready: Promise.resolve(),
      save: vi.fn(async () => true),
    };
    stopCapture = vi.fn();
    runtime = {
      controllers: signal<readonly ControllerInfo[]>([]),
      selectedController: signal<string | null>(null),
      captureBinding: vi.fn((listener: (control: ButtonControl) => void) => {
        captureListener = listener;
        return stopCapture;
      }),
      selectController: vi.fn(),
    };
    close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ControlsComponent],
      providers: [
        { provide: ControlSettingsService, useValue: settings },
        { provide: GameRuntimeService, useValue: runtime },
        { provide: DialogRef, useValue: { close } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ControlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('edits a detached draft and applies it only through explicit save', async () => {
    component.remove('gameplay', 'interact', 0);
    expect(settings.profile()).toEqual(defaultProfile);
    expect(settings.save).not.toHaveBeenCalled();
    await component.save();
    expect(settings.save).toHaveBeenCalledExactlyOnceWith(component.draft());
    expect(close).toHaveBeenCalledOnce();
    expect(component.saving()).toBe(false);
  });

  it('replaces a direction or appends a binding using raw capture and releases its subscription', () => {
    component.capture('gameplay', 'move', 0, 'up');
    expect(component.captureLabel()).toContain('Move Up');
    captureListener({ device: 'keyboard', code: 'ArrowUp' });
    expect(component.draft().contexts.gameplay.move[0]).toMatchObject({
      up: { device: 'keyboard', code: 'ArrowUp' },
    });
    expect(component.captureLabel()).toBeNull();
    expect(stopCapture).toHaveBeenCalledOnce();
    component.selectTab('gamepad');
    component.capture('gameplay', 'interact');
    captureListener({ device: 'gamepad', button: 'rightTrigger' });
    expect(component.draft().contexts.gameplay.interact.at(-1)).toEqual({
      device: 'gamepad',
      button: 'rightTrigger',
    });
  });

  it('cancels capture with Escape without saving or closing the dialog', () => {
    component.capture('gameplay', 'interact');
    const event = new KeyboardEvent('keydown', {
      code: 'Escape',
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    (fixture.nativeElement as HTMLElement).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(stopCapture).toHaveBeenCalledOnce();
    expect(component.captureLabel()).toBeNull();
    expect(settings.save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('resets only the draft and cancels pending capture', () => {
    component.remove('ui', 'submit', 0);
    component.capture('gameplay', 'interact');
    component.reset();
    expect(component.draft()).toEqual(defaultProfile);
    expect(stopCapture).toHaveBeenCalledOnce();
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('keeps edits and shows persistence failure without closing', async () => {
    settings.save.mockImplementation(async () => {
      settings.error.set('Controls were not saved');
      return false;
    });
    component.remove('gameplay', 'interact', 0);
    await component.save();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('not saved');
  });

  it('updates stick deadzone/direction and sends Automatic controller selection as null', () => {
    const stick = document.createElement('select');
    stick.append(new Option('Right', 'right'));
    component.changeStick('gameplay', 'move', 1, { target: stick } as unknown as Event);
    const range = document.createElement('input');
    range.value = '0.33';
    component.changeDeadzone('gameplay', 'move', 1, { target: range } as unknown as Event);
    expect(component.draft().contexts.gameplay.move[1]).toMatchObject({
      stick: 'right',
      deadzone: 0.33,
    });
    const selection = document.createElement('select');
    selection.append(new Option('Automatic', ''));
    component.selectController({ target: selection } as unknown as Event);
    expect(runtime.selectController).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('shows the requested controller on reopen and follows Automatic fallback after disconnect', async () => {
    const controller: ControllerInfo = {
      id: 'dualsense:1',
      type: 'dualsense',
      slot: 1,
      name: 'Second controller',
      selected: true,
    };
    runtime.controllers.set([controller]);
    runtime.selectedController.set(controller.id);
    fixture.destroy();
    fixture = TestBed.createComponent(ControlsComponent);
    component = fixture.componentInstance;
    component.selectTab('gamepad');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '[aria-label="Selected controller"]',
    )!;
    expect(select.value).toBe(controller.id);
    runtime.selectedController.set(null);
    runtime.controllers.set([]);
    fixture.detectChanges();
    expect(select.value).toBe('');
  });

  it('unsubscribes a pending capture when destroyed and preserves saved settings on close', () => {
    component.capture('gameplay', 'interact');
    fixture.destroy();
    expect(stopCapture).toHaveBeenCalledOnce();
    expect(settings.profile()).toEqual(defaultProfile);
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('waits for persisted controls before enabling editing and saving', async () => {
    fixture.destroy();
    let ready!: () => void;
    settings.ready = new Promise<void>((resolve) => (ready = resolve));
    fixture = TestBed.createComponent(ControlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const button = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((element) => element.textContent?.trim() === 'Save controls')!;
    expect(button.disabled).toBe(true);
    const saved: BindingProfile = {
      ...defaultProfile,
      contexts: {
        ...defaultProfile.contexts,
        gameplay: {
          ...defaultProfile.contexts.gameplay,
          interact: [{ device: 'keyboard', code: 'KeyF' }],
        },
      },
    };
    settings.profile.set(saved);
    ready();
    await settings.ready;
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.draft()).toEqual(saved);
    expect(button.disabled).toBe(false);
  });

  it('presents accessible controls and capture status', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-labelledby', 'controls-title');
    const results = await axe.run(element);
    expect(
      results.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) })),
    ).toEqual([]);
    component.selectTab('gamepad');
    fixture.detectChanges();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('shows one row per action and separates device bindings without changing stored indexes', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const move = element.querySelector('[data-action="gameplay.move"]')!;
    expect(move.querySelectorAll('th')).toHaveLength(1);
    expect(move.textContent).toContain('W / S / A / D');
    expect(move.textContent).not.toContain('Left stick');
    expect(element.querySelector('[aria-label="Selected controller"]')).toBeNull();
    component.selectTab('gamepad');
    fixture.detectChanges();
    expect(element.querySelector('[data-action="gameplay.move"]')!.textContent).toContain(
      'Left stick',
    );
    expect(element.querySelector('[data-action="gameplay.move"]')!.textContent).not.toContain(
      'W / S',
    );
    const entry = component.visibleBindings(component.draft().contexts.gameplay.interact)[0];
    expect(entry.index).toBe(2);
    component.remove('gameplay', 'interact', entry.index);
    expect(component.draft().contexts.gameplay.interact).toEqual(
      defaultProfile.contexts.gameplay.interact.filter((binding) => binding.device !== 'gamepad'),
    );
  });

  it('captures only the active device tab and cancels capture when switching tabs', () => {
    component.capture('gameplay', 'interact');
    captureListener({ device: 'gamepad', button: 'north' });
    expect(component.captureLabel()).not.toBeNull();
    expect(component.draft()).toEqual(defaultProfile);
    captureListener({ device: 'keyboard', code: 'ControlLeft' });
    expect(component.draft().contexts.gameplay.interact.at(-1)).toEqual({
      device: 'keyboard',
      code: 'ControlLeft',
    });
    component.capture('gameplay', 'interact');
    component.selectTab('gamepad');
    expect(component.captureLabel()).toBeNull();
    expect(stopCapture).toHaveBeenCalledTimes(2);
  });

  it('uses roving keyboard tabs with automatic activation and keeps a single tab stop', () => {
    const element = fixture.nativeElement as HTMLElement;
    const keyboard = element.querySelector<HTMLButtonElement>('#controls-tab-keyboard')!;
    const gamepad = element.querySelector<HTMLButtonElement>('#controls-tab-gamepad')!;
    keyboard.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    keyboard.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(component.tab()).toBe('gamepad');
    expect(document.activeElement).toBe(gamepad);
    expect(gamepad.tabIndex).toBe(0);
    expect(keyboard.tabIndex).toBe(-1);
    gamepad.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(component.tab()).toBe('keyboard');
    expect(document.activeElement).toBe(keyboard);
  });

  it('tunes sticks above the bindings and preserves separate movement and menu deadzones', () => {
    component.selectTab('gamepad');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const range = element.querySelector<HTMLInputElement>(
      '[aria-label="Move Left stick deadzone"]',
    )!;
    expect(range.closest('.gamepad-settings')).not.toBeNull();
    expect(element.querySelector('table input[type="range"]')).toBeNull();
    range.value = '0.27';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(component.draft().contexts.gameplay.move[1]).toMatchObject({ deadzone: 0.27 });
    expect(
      component.draft().contexts.ui.navigate.find((binding) => binding.kind === 'stick2d'),
    ).toEqual(defaultProfile.contexts.ui.navigate.find((binding) => binding.kind === 'stick2d'));
    expect(settings.profile()).toEqual(defaultProfile);
  });

  it('uses selected controller face names and supports a disconnected label preview', () => {
    runtime.controllers.set([
      { id: 'dualsense:0', type: 'dualsense', slot: 0, name: 'DualSense', selected: true },
    ]);
    component.selectTab('gamepad');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-action="gameplay.confirm"]')!.textContent).toContain(
      'Cross',
    );
    runtime.controllers.set([]);
    component.labelStyle.set('dualshock');
    fixture.detectChanges();
    expect(element.querySelector('[data-action="gameplay.confirm"]')!.textContent).toContain(
      'Cross',
    );
    expect(settings.save).not.toHaveBeenCalled();
  });
});
