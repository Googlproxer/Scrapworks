import type { MockInstance } from 'vitest';
import {
  DeviceSource,
  type DeviceSourceManager,
  DeviceType,
  PointerInput,
  XboxInput,
  type IKeyboardEvent,
  type IPointerEvent,
  type IWheelEvent,
} from '@babylonjs/core';
import type { IDeviceInputSystem } from '@babylonjs/core/DeviceInput/inputInterfaces';
import { actions, defaultProfile } from './bindings';
import { InputCapture } from './capture';
import { ActionEvaluator } from './evaluator/evaluator';
import { compileRules } from './evaluator/evaluator.helpers';
import type { ActionFrame, RawInput } from './evaluator/evaluator.types';

describe('InputCapture', () => {
  let dsm: Pick<DeviceSourceManager, 'getDeviceSource'>;
  let evaluator: ActionEvaluator;
  let capture: InputCapture;
  let sampled: MockInstance<ActionEvaluator['sample']>;

  beforeEach(() => {
    dsm = { getDeviceSource: vi.fn(() => null) };
    evaluator = new ActionEvaluator({
      gameplay: compileRules(actions.gameplay, defaultProfile.contexts.gameplay),
      ui: compileRules(actions.ui, defaultProfile.contexts.ui),
    });
    evaluator.setContext('gameplay');
    sampled = vi.spyOn(evaluator, 'sample');
    capture = new InputCapture(dsm, evaluator);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function keyboard(
    type: 'keydown' | 'keyup',
    code: string,
    options: Partial<IKeyboardEvent> = {},
  ) {
    const preventDefault = vi.fn();
    const event: IKeyboardEvent = {
      type,
      code,
      key: code,
      keyCode: 0,
      inputIndex: 0,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      target: null,
      preventDefault,
      ...options,
    };
    capture.onKeyboard(event);
    return preventDefault;
  }

  function snapshot(): RawInput {
    return sampled.mock.calls.at(-1)![0];
  }

  function button(frame: ActionFrame, name: string) {
    const state = frame.states[name];
    if (state?.kind !== 'button') throw new Error('Expected button: ' + name);
    return state;
  }

  function pointer(type: string, inputIndex: PointerInput) {
    // Only these fields are read; movement, coordinates and modifiers do not
    // affect button conversion. Events are supplied after ownership checks.
    capture.onMouse({ type, inputIndex } as IPointerEvent | IWheelEvent);
  }

  function connectXbox(values: ReadonlyMap<XboxInput, number>) {
    const pollInput = vi.fn(
      (_type: DeviceType, _slot: number, index: number) => values.get(index) ?? 0,
    );
    const source = new DeviceSource(
      { pollInput } as unknown as IDeviceInputSystem,
      DeviceType.Xbox,
      3,
    );
    const getSource = vi.spyOn(dsm, 'getDeviceSource').mockReturnValue(source);
    return { source, getSource };
  }

  it('records a fast keyboard tap without losing either action edge', () => {
    expect(keyboard('keydown', 'Space')).toHaveBeenCalledOnce();
    expect(keyboard('keyup', 'Space')).not.toHaveBeenCalled();
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: false,
      pressed: true,
      released: true,
    });
  });

  it('keeps left/right modifiers, movement, jump and strafe as independent physical inputs', () => {
    for (const code of [
      'ControlLeft',
      'ControlRight',
      'AltLeft',
      'AltRight',
      'ShiftLeft',
      'KeyW',
      'Space',
      'KeyD',
    ]) {
      keyboard('keydown', code, { ctrlKey: true, altKey: true, shiftKey: true });
    }
    const before = snapshot();
    keyboard('keyup', 'ControlLeft', { ctrlKey: true, altKey: true });
    expect(snapshot().down.has('keyboard:ControlLeft')).toBe(false);
    expect(snapshot().down.has('keyboard:ControlRight')).toBe(true);
    expect(before.down.has('keyboard:ControlLeft')).toBe(true);
    const frame = evaluator.takeFrame();
    expect(button(frame, 'jump').held).toBe(true);
    expect(button(frame, 'sprint').held).toBe(true);
  });

  it('uses physical code despite a changed printable key', () => {
    keyboard('keydown', 'KeyW', { key: 'W', shiftKey: true });
    expect(snapshot().down.has('keyboard:KeyW')).toBe(true);
    keyboard('keyup', 'KeyW', { key: 'w' });
    expect(snapshot().down.has('keyboard:KeyW')).toBe(false);
  });

  it('prevents accepted repeats without recording a new press', () => {
    keyboard('keydown', 'Space');
    evaluator.takeFrame();
    const calls = sampled.mock.calls.length;
    expect(keyboard('keydown', 'Space', { repeat: true })).toHaveBeenCalledOnce();
    keyboard('keydown', 'Space');
    expect(sampled).toHaveBeenCalledTimes(calls);
    expect(button(evaluator.takeFrame(), 'jump').pressed).toBe(false);
  });

  it('ignores unsupported codes and unrelated keyboard event types', () => {
    for (const code of ['', 'Unidentified', 'NotARealCode', '__proto__']) {
      expect(keyboard('keydown', code)).not.toHaveBeenCalled();
    }
    capture.onKeyboard({ type: 'keypress', code: 'Space' } as IKeyboardEvent);
    expect(sampled).not.toHaveBeenCalled();
  });

  it('ignores prevented keydown while still accepting prevented release', () => {
    const down = {
      type: 'keydown',
      code: 'Space',
      defaultPrevented: true,
    } as unknown as IKeyboardEvent;
    capture.onKeyboard(down);
    expect(sampled).not.toHaveBeenCalled();
    keyboard('keydown', 'Space');
    capture.onKeyboard({
      type: 'keyup',
      code: 'Space',
      defaultPrevented: true,
    } as unknown as IKeyboardEvent);
    expect(button(evaluator.takeFrame(), 'jump').released).toBe(true);
  });

  it.each([
    [PointerInput.LeftClick, 'primary'],
    [PointerInput.MiddleClick, 'middle'],
    [PointerInput.RightClick, 'secondary'],
    [PointerInput.BrowserBack, 'back'],
    [PointerInput.BrowserForward, 'forward'],
  ] as const)('maps pointer button %s to %s', (index, name) => {
    pointer('pointerdown', index);
    expect(snapshot().down.has('mouse:' + name)).toBe(true);
    pointer('pointerup', index);
    expect(snapshot().down.has('mouse:' + name)).toBe(false);
  });

  it('does not convert mouse movement or wheel events into held buttons', () => {
    pointer('pointermove', PointerInput.Move);
    pointer('wheel', PointerInput.MouseWheelY);
    expect(sampled).not.toHaveBeenCalled();
  });

  it('aggregates mouse and keyboard interaction bindings', () => {
    keyboard('keydown', 'KeyE');
    pointer('pointerdown', PointerInput.LeftClick);
    evaluator.takeFrame();
    pointer('pointerup', PointerInput.LeftClick);
    expect(button(evaluator.takeFrame(), 'interact')).toMatchObject({
      held: true,
      pressed: false,
      released: false,
    });
  });

  it('polls an assigned Xbox slot and publishes buttons and both inverted-Y sticks together', () => {
    const values = new Map<XboxInput, number>([
      [XboxInput.A, 1],
      [XboxInput.RS, 1],
      [XboxInput.Back, 1],
      [XboxInput.LStickXAxis, 0.5],
      [XboxInput.LStickYAxis, -0.75],
      [XboxInput.RStickXAxis, -0.3],
      [XboxInput.RStickYAxis, 0.4],
    ]);
    const { getSource } = connectXbox(values);
    capture.pollXbox(3);
    expect(getSource).toHaveBeenCalledWith(DeviceType.Xbox, 3);
    expect(sampled).toHaveBeenCalledOnce();
    expect([...snapshot().down]).toEqual(
      expect.arrayContaining(['gamepad:south', 'gamepad:rightStick', 'gamepad:select']),
    );
    expect(snapshot().sticks).toEqual({
      left: { x: 0.5, y: 0.75 },
      right: { x: -0.3, y: -0.4 },
    });
  });

  it('releases disconnected controller input while preserving keyboard-held actions', () => {
    const { getSource } = connectXbox(new Map([[XboxInput.A, 1]]));
    keyboard('keydown', 'Space');
    capture.pollXbox(3);
    evaluator.takeFrame();
    getSource.mockReturnValue(null);
    capture.pollXbox(3);
    expect([...snapshot().down]).toEqual(['keyboard:Space']);
    expect(snapshot().sticks).toMatchObject({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({ held: true, released: false });
  });

  it('clears only the requested device and resets sticks when clearing gamepad', () => {
    connectXbox(
      new Map([
        [XboxInput.A, 1],
        [XboxInput.LStickXAxis, 1],
      ]),
    );
    keyboard('keydown', 'Space');
    pointer('pointerdown', PointerInput.LeftClick);
    capture.pollXbox(3);
    capture.clearDevice('keyboard');
    expect(snapshot().down.has('keyboard:Space')).toBe(false);
    expect(snapshot().down.has('mouse:primary')).toBe(true);
    expect(snapshot().down.has('gamepad:south')).toBe(true);
    capture.clearDevice('gamepad');
    expect([...snapshot().down]).toEqual(['mouse:primary']);
    expect(snapshot().sticks).toMatchObject({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
  });

  it('publishes held physical state to a replacement evaluator before its context is activated', () => {
    keyboard('keydown', 'Space');
    const replacement = new ActionEvaluator({
      gameplay: compileRules(actions.gameplay, defaultProfile.contexts.gameplay),
      ui: compileRules(actions.ui, defaultProfile.contexts.ui),
    });
    capture.updateEvaluator(replacement);
    replacement.setContext('gameplay');
    expect(button(replacement.takeFrame(), 'jump').held).toBe(false);
    keyboard('keyup', 'Space');
    keyboard('keydown', 'Space');
    expect(button(replacement.takeFrame(), 'jump').pressed).toBe(true);
  });
});
