import { DeviceSource, DeviceSourceManager, DeviceType, NullEngine } from '@babylonjs/core';
import type { IDeviceInputSystem } from '@babylonjs/core/DeviceInput/inputInterfaces';
import { BehaviorSubject } from 'rxjs';
import type { MockInstance } from 'vitest';
import { BrowserActivity } from '../lifecycle/browser-activity';
import { defaultProfile } from './bindings';
import { InputCapture } from './capture';
import { ActionEvaluator } from './evaluator/evaluator';
import type { ActionFrame } from './evaluator/evaluator.types';
import { InputManager } from './input-manager';

describe('InputManager coordination', () => {
  let engine: NullEngine;
  let canvas: HTMLCanvasElement;
  let input: InputManager;
  let captures: InputCapture[];
  let deviceManagers: DeviceSourceManager[];
  let previousActivity: BrowserActivity;
  let hasFocus: BehaviorSubject<boolean>;
  let visible: BehaviorSubject<boolean>;
  let readEvaluator: MockInstance<ActionEvaluator['takeFrame']>;

  beforeEach(() => {
    captures = [];
    deviceManagers = [];
    hasFocus = new BehaviorSubject(true);
    visible = new BehaviorSubject(true);
    previousActivity = BrowserActivity.Instance;
    BrowserActivity.Instance = {
      hasFocusObs: hasFocus.asObservable(),
      visibleObs: visible.asObservable(),
    } as BrowserActivity;
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    engine = new NullEngine();
    vi.spyOn(engine, 'getInputElement').mockReturnValue(canvas);
    const addDevice = DeviceSourceManager.prototype._addDevice;
    vi.spyOn(DeviceSourceManager.prototype, '_addDevice').mockImplementation(function (
      this: DeviceSourceManager,
      device,
    ) {
      deviceManagers.push(this);
      addDevice.call(this, device);
    });
    // Observe the public capture/evaluator seam until the manager exposes frames.
    const poll = InputCapture.prototype.pollXbox;
    vi.spyOn(InputCapture.prototype, 'pollXbox').mockImplementation(function (
      this: InputCapture,
      slot,
    ) {
      captures.push(this);
      poll.call(this, slot);
    });
    readEvaluator = vi.spyOn(ActionEvaluator.prototype, 'takeFrame');
    input = new InputManager(engine);
    input.setViewportActive(true);
    readFrame();
  });

  afterEach(() => {
    input.dispose();
    engine.dispose();
    canvas.remove();
    BrowserActivity.Instance = previousActivity;
    hasFocus.complete();
    visible.complete();
    vi.restoreAllMocks();
  });

  function readFrame(): ActionFrame {
    input.takeFrame();
    return readEvaluator.mock.results.at(-1)!.value as ActionFrame;
  }

  function pressJump(): void {
    captures.at(-1)!.onKeyboard({
      type: 'keydown',
      code: 'Space',
      key: ' ',
      keyCode: 32,
      inputIndex: 32,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      target: canvas,
      preventDefault: vi.fn(),
    });
  }

  it('requires viewport permission even when browser activity and UI permission allow input', () => {
    input.setViewportActive(false);
    expect(input.enabled).toBe(false);
    input.setEnabled(true);
    expect(input.enabled).toBe(false);
    input.setViewportActive(true);
    expect(input.enabled).toBe(true);
  });

  it('preserves UI blocking across viewport, focus and visibility recovery', () => {
    input.setEnabled(false);
    input.setViewportActive(false);
    hasFocus.next(false);
    visible.next(false);
    input.setViewportActive(true);
    hasFocus.next(true);
    visible.next(true);
    expect(input.enabled).toBe(false);
    input.setEnabled(true);
    expect(input.enabled).toBe(true);
  });

  it.each(['focus', 'visibility'] as const)('gates permission on browser %s', (reason) => {
    const activity = reason === 'focus' ? hasFocus : visible;
    activity.next(false);
    expect(input.enabled).toBe(false);
    activity.next(true);
    expect(input.enabled).toBe(true);
  });

  it('completes its public stream and disposes subscriptions idempotently', () => {
    const completed = vi.fn();
    const subscription = input.enabledObs.subscribe({ complete: completed });
    input.dispose();
    input.dispose();
    hasFocus.next(false);
    input.setViewportActive(false);
    expect(completed).toHaveBeenCalledOnce();
    subscription.unsubscribe();
  });

  // Real integration regressions: these must pass once the manager is wired.
  it('selects the connected controller slot and keeps it when a keyboard connects', () => {
    // Register sources through Babylon's own device-registration boundary so
    // its real Observable delivers both the source and EventState to RxJS.
    const dsm = deviceManagers.at(-1)!;
    const source = { pollInput: () => 0 } as unknown as IDeviceInputSystem;
    dsm._addDevice(new DeviceSource(source, DeviceType.Xbox, 3));
    readFrame();
    expect(InputCapture.prototype.pollXbox).toHaveBeenLastCalledWith(3);

    dsm._addDevice(new DeviceSource(source, DeviceType.Keyboard, 0));
    readFrame();
    expect(InputCapture.prototype.pollXbox).toHaveBeenLastCalledWith(3);
  });

  it('turns DeviceSourceManager keyboard events into actions', () => {
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      keyCode: 32,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(event);
    expect(readFrame().states['jump']).toMatchObject({ held: true, pressed: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('exposes evaluated action frames to its consumer', () => {
    pressJump();
    expect(input.takeFrame()).toMatchObject({
      context: 'gameplay',
      states: { jump: { kind: 'button', held: true, pressed: true } },
    });
  });

  it('clears captured action state rather than only the legacy key-map stream', () => {
    pressJump();
    expect(readFrame().states['jump']).toMatchObject({ held: true });
    input.clear();
    const jump = readFrame().states['jump'];
    expect(jump?.kind === 'button' && jump.held).toBe(false);
  });

  it.each(['UI permission', 'viewport', 'focus', 'visibility'] as const)(
    'suspends gameplay action evaluation when %s is lost',
    (reason) => {
      pressJump();
      readFrame();
      if (reason === 'UI permission') input.setEnabled(false);
      if (reason === 'viewport') input.setViewportActive(false);
      if (reason === 'focus') hasFocus.next(false);
      if (reason === 'visibility') visible.next(false);
      expect(input.enabled).toBe(false);
      const frame = readFrame();
      const jump = frame.states['jump'];
      expect(frame.context === 'gameplay' && jump?.kind === 'button' && jump.held).toBe(false);
    },
  );

  it('preserves the active context when replacing the binding profile', () => {
    input.updateBindings({
      ...defaultProfile,
      contexts: {
        ...defaultProfile.contexts,
        gameplay: {
          ...defaultProfile.contexts.gameplay,
          jump: [{ device: 'keyboard', code: 'KeyZ' }],
        },
      },
    });
    expect(readFrame().context).toBe('gameplay');
  });

  it('disposes its DeviceSourceManager while the engine remains alive', () => {
    const dispose = vi.spyOn(DeviceSourceManager.prototype, 'dispose');
    input.dispose();
    input.dispose();
    expect(engine.isDisposed).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
