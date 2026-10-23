import {
  DeviceSource,
  DeviceSourceManager,
  DeviceType,
  NullEngine,
  XboxInput,
  DualSenseInput,
} from '@babylonjs/core';
import type { IDeviceInputSystem } from '@babylonjs/core/DeviceInput/inputInterfaces';
import { defaultProfile, type ButtonControl } from '@contracts/input';
import { InputManager } from './input-manager';

describe('InputManager coordination', () => {
  let engine: NullEngine;
  let canvas: HTMLCanvasElement;
  let input: InputManager;
  let manager: DeviceSourceManager;
  let focused: boolean;
  let hidden: boolean;

  beforeEach(() => {
    focused = true;
    hidden = false;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    engine = new NullEngine();
    vi.spyOn(engine, 'getInputElement').mockReturnValue(canvas);
    const seenManagers: DeviceSourceManager[] = [];
    const addDevice = DeviceSourceManager.prototype._addDevice;
    vi.spyOn(DeviceSourceManager.prototype, '_addDevice').mockImplementation(function (
      this: DeviceSourceManager,
      device,
    ) {
      seenManagers.push(this);
      addDevice.call(this, device);
    });
    input = new InputManager(engine);
    input.setViewportActive(true);
    canvas.focus();
    key('KeyW', true);
    key('KeyW', false);
    manager = seenManagers.at(-1)!;
    input.takeFrame();
  });

  afterEach(() => {
    input.dispose();
    engine.dispose();
    canvas.remove();
    vi.restoreAllMocks();
  });

  function key(code: string, down: boolean, options: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code,
      keyCode: code === 'Space' ? 32 : code.charCodeAt(code.length - 1),
      bubbles: true,
      cancelable: true,
      ...options,
    });
    canvas.dispatchEvent(event);
    return event;
  }

  function controller(
    type: DeviceType.Xbox | DeviceType.DualSense | DeviceType.DualShock,
    slot: number,
    values = new Map<number, number>(),
  ) {
    const source = new DeviceSource(
      {
        pollInput: (_type: number, _slot: number, index: number) => values.get(index) ?? 0,
      } as unknown as IDeviceInputSystem,
      type,
      slot,
    );
    manager._addDevice(source);
    return source;
  }

  it('requires viewport, browser and application permission while preserving UI blocking', () => {
    input.setViewportActive(false);
    expect(input.enabled).toBe(false);
    input.setEnabled(false);
    input.setViewportActive(true);
    focused = false;
    window.dispatchEvent(new Event('blur'));
    focused = true;
    window.dispatchEvent(new Event('focus'));
    expect(input.enabled).toBe(false);
    input.setEnabled(true);
    expect(input.enabled).toBe(true);
  });

  it('turns DeviceSourceManager keyboard events into one returned action frame', () => {
    expect(key('Space', true).defaultPrevented).toBe(true);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: true, pressed: true });
    expect(input.takeFrame().states['jump']).toMatchObject({ held: true, pressed: false });
    key('Space', false);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false, released: true });
  });

  it('does not consume unbound keys or composition', () => {
    expect(key('KeyL', true).defaultPrevented).toBe(false);
    expect(key('Space', true, { isComposing: true }).defaultPrevented).toBe(false);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false });
  });

  it('selects only controllers, retains selection when a keyboard connects and supports explicit choice', () => {
    controller(DeviceType.Xbox, 3);
    controller(DeviceType.DualSense, 1);
    const source = { pollInput: () => 0 } as unknown as IDeviceInputSystem;
    manager._addDevice(new DeviceSource(source, DeviceType.Keyboard, 0));
    expect(input.getControllers()).toEqual([
      expect.objectContaining({ id: 'xbox:3', selected: true }),
      expect.objectContaining({ id: 'dualsense:1', selected: false }),
    ]);
    expect(input.selectController('dualsense:1')).toBe(true);
    expect(input.getControllers()[1].selected).toBe(true);
    expect(input.selectController('missing')).toBe(false);
    expect(input.selectController(null)).toBe(true);
    expect(input.getControllers()[0].selected).toBe(true);
  });

  it.each([DeviceType.Xbox, DeviceType.DualShock, DeviceType.DualSense] as const)(
    'polls controller type %s with its actual axis mapping',
    (type) => {
      const values = new Map<number, number>();
      controller(type, 2, values);
      values.set(0, 1);
      values.set(type === DeviceType.Xbox ? XboxInput.LStickXAxis : DualSenseInput.LStickXAxis, 1);
      values.set(7, 0.7);
      const frame = input.takeFrame();
      expect(frame.states['jump']).toMatchObject({ held: true, pressed: true });
      expect(frame.states['move']).toMatchObject({ value: { x: 1, y: 0 } });
      expect(frame.states['zoomIn']).toMatchObject({ held: true });
    },
  );

  it('releases disconnected controller actions and publishes its removal', () => {
    const values = new Map<number, number>();
    const source = controller(DeviceType.Xbox, 3, values);
    values.set(XboxInput.A, 1);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: true });
    manager.onDeviceDisconnectedObservable.notifyObservers(source);
    expect(input.getControllers()).toEqual([]);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false });
    controller(DeviceType.DualSense, 1);
    expect(input.getControllers()).toEqual([
      expect.objectContaining({ id: 'dualsense:1', selected: true }),
    ]);
  });

  it.each(['UI permission', 'viewport', 'focus', 'visibility'] as const)(
    'cancels action frames when %s is lost',
    (reason) => {
      key('Space', true);
      const frame = input.takeFrame();
      if (reason === 'UI permission') input.setEnabled(false);
      if (reason === 'viewport') input.setViewportActive(false);
      if (reason === 'focus') {
        focused = false;
        window.dispatchEvent(new Event('blur'));
      }
      if (reason === 'visibility') {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      }
      expect(input.enabled).toBe(false);
      expect(input.takeFrame().context).toBeNull();
      expect(input.isCurrent(frame)).toBe(false);
    },
  );

  it('keeps UI actions available without canvas ownership and protects native editable controls', () => {
    input.setEnabled(false);
    input.setViewportActive(false);
    input.setContext('ui');
    expect(input.handleUiKeyboard({ code: 'Enter', down: true, editable: true })).toBe(false);
    expect(input.takeFrame().states['submit']).toMatchObject({ held: false });
    expect(input.handleUiKeyboard({ code: 'Enter', down: true })).toBe(true);
    expect(input.takeFrame()).toMatchObject({
      context: 'ui',
      states: { submit: { pressed: true } },
    });
  });

  it('continues polling a controller while Angular owns UI', () => {
    const values = new Map<number, number>();
    controller(DeviceType.Xbox, 0, values);
    input.setContext('ui');
    input.setViewportActive(false);
    values.set(XboxInput.A, 1);
    expect(input.takeFrame().states['submit']).toMatchObject({ pressed: true });
  });

  it.each(['gameplay', null] as const)(
    'releases a held UI key after context becomes %s without claiming its native event',
    (context) => {
      input.setContext('ui');
      expect(input.handleUiKeyboard({ code: 'Enter', down: true })).toBe(true);
      expect(input.takeFrame().states['submit']).toMatchObject({ held: true, pressed: true });
      input.setContext(context);
      expect(input.handleUiKeyboard({ code: 'Enter', down: false, editable: true })).toBe(false);
      input.setContext('ui');
      expect(input.takeFrame().states['submit']).toMatchObject({ held: false });
      input.handleUiKeyboard({ code: 'Enter', down: true });
      expect(input.takeFrame().states['submit']).toMatchObject({ held: true, pressed: true });
    },
  );

  it('does not capture Inspector keydowns while the requested context is null', () => {
    input.setContext('ui');
    const captured = vi.fn();
    const stop = input.subscribeRawInput(captured);
    input.setContext(null);
    expect(input.handleUiKeyboard({ code: 'KeyA', down: true })).toBe(false);
    expect(key('KeyA', true).defaultPrevented).toBe(false);
    expect(input.takeFrame().context).toBeNull();
    expect(captured).not.toHaveBeenCalled();
    input.setContext('ui');
    expect(input.handleUiKeyboard({ code: 'KeyA', down: true })).toBe(true);
    expect(captured).toHaveBeenCalledExactlyOnceWith({ device: 'keyboard', code: 'KeyA' });
    stop();
  });

  it('suppresses held controls after rebind and invalidates frames from the old evaluator', () => {
    key('Space', true);
    const before = input.takeFrame();
    input.updateBindings(defaultProfile);
    expect(input.isCurrent(before)).toBe(false);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false });
    key('Space', false);
    key('Space', true);
    expect(input.takeFrame().states['jump']).toMatchObject({ held: true, pressed: true });
  });

  it('captures keyboard, pointer and controller presses without leaking the capture press into UI', () => {
    input.setContext('ui');
    const captured: ButtonControl[] = [];
    const stop = input.subscribeRawInput((control) => captured.push(control));
    expect(input.handleUiKeyboard({ code: 'KeyZ', down: true, editable: true })).toBe(true);
    expect(input.handleUiPointer({ button: 2, down: true })).toBe(true);
    const values = new Map<number, number>();
    controller(DeviceType.DualSense, 0, values);
    values.set(DualSenseInput.Cross, 1);
    input.takeFrame();
    expect(captured).toEqual([
      { device: 'keyboard', code: 'KeyZ' },
      { device: 'mouse', button: 'secondary' },
      { device: 'gamepad', button: 'south' },
    ]);
    expect(input.takeFrame().context).toBeNull();
    stop();
    expect(input.takeFrame().states['submit']).toMatchObject({ held: false });
  });

  it('clears actions and disposes device subscriptions before the engine, idempotently', () => {
    key('Space', true);
    input.clear();
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false });
    const dispose = vi.spyOn(DeviceSourceManager.prototype, 'dispose');
    const complete = vi.fn();
    input.enabledObs.subscribe({ complete });
    input.dispose();
    input.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(engine.isDisposed).toBe(false);
    expect(input.enabled).toBe(false);
  });

  it('suppresses a previously unbound held key when rebound to an action', () => {
    key('KeyZ', true);
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
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false });
    key('KeyZ', false);
    key('KeyZ', true);
    expect(input.takeFrame().states['jump']).toMatchObject({ pressed: true });
  });

  it.each(['ui', 'gameplay', null] as const)(
    'accepts the pointer release after capture ends and context becomes %s',
    (context) => {
      input.setContext('ui');
      const first = vi.fn();
      const stop = input.subscribeRawInput((control) => {
        first(control);
        stop();
      });
      expect(input.handleUiPointer({ button: 0, down: true })).toBe(true);
      input.setContext(context);
      expect(input.handleUiPointer({ button: 0, down: false })).toBe(false);
      input.setContext('ui');
      const second = vi.fn();
      const stopSecond = input.subscribeRawInput(second);
      input.handleUiPointer({ button: 0, down: true });
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
      stopSecond();
    },
  );

  it('blocks held buttons and sticks when selecting a different controller', () => {
    controller(DeviceType.Xbox, 0);
    const values = new Map<number, number>([
      [DualSenseInput.Cross, 1],
      [DualSenseInput.LStickXAxis, 1],
    ]);
    controller(DeviceType.DualSense, 1, values);
    input.selectController('dualsense:1');
    expect(input.takeFrame().states['jump']).toMatchObject({ held: false });
    expect(input.takeFrame().states['move']).toMatchObject({ value: { x: 0, y: 0 } });
    values.clear();
    input.takeFrame();
    values.set(DualSenseInput.Cross, 1);
    expect(input.takeFrame().states['jump']).toMatchObject({ pressed: true });
  });

  it('selects controller targeting on actual activity and preserves a newer mouse target during idle polls', () => {
    const values = new Map<number, number>();
    controller(DeviceType.Xbox, 0, values);
    expect(input.usingController).toBe(false);
    values.set(XboxInput.LStickXAxis, 0.1);
    input.takeFrame();
    expect(input.usingController).toBe(false);
    values.set(XboxInput.LStickXAxis, 0.7);
    input.takeFrame();
    expect(input.usingController).toBe(true);
    input.markPointerActivity();
    input.takeFrame();
    expect(input.usingController).toBe(false);
    values.set(XboxInput.A, 1);
    input.takeFrame();
    expect(input.usingController).toBe(true);
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 12,
        clientY: 20,
        bubbles: true,
      }),
    );
    expect(input.usingController).toBe(false);
  });
});
