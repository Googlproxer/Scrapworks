import { BehaviorSubject, type Subscription } from 'rxjs';
import { BrowserActivity } from '../lifecycle/browser-activity';
import type { KeyMapKey, ReadonlyKeyMap } from './key-map';
import { ViewportInput } from './viewport-input';

describe('ViewportInput', () => {
  let hasFocus: BehaviorSubject<boolean>;
  let visible: BehaviorSubject<boolean>;
  let previousActivity: BrowserActivity;
  let canvas: HTMLCanvasElement;
  let input: ViewportInput;
  let state: ReadonlyKeyMap;
  let subscription: Subscription;
  let emissions: number;

  beforeEach(() => {
    hasFocus = new BehaviorSubject(true);
    visible = new BehaviorSubject(true);
    previousActivity = BrowserActivity.Instance;
    BrowserActivity.Instance = {
      hasFocusObs: hasFocus.asObservable(),
      visibleObs: visible.asObservable(),
    } as BrowserActivity;
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    input = new ViewportInput(canvas);
    emissions = 0;
    subscription = input.stateObs.subscribe((value) => {
      state = value;
      emissions++;
    });
  });

  afterEach(() => {
    input.dispose();
    BrowserActivity.Instance = previousActivity;
    subscription.unsubscribe();
    canvas.remove();
    hasFocus.complete();
    visible.complete();
  });

  function keyEvent(target: EventTarget, type: 'keydown' | 'keyup', options: Omit<KeyboardEventInit, 'code'> & { code?: KeyMapKey } = {}) {
    const event = new KeyboardEvent(type, { code: 'Space', bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  }

  it('immediately publishes a key map with every key released', () => {
    expect(emissions).toBe(1);
    expect(state).toMatchObject({
      Space: false,
      KeyW: false,
      ArrowUp: false,
      ControlLeft: false,
      ControlRight: false,
      ShiftLeft: false,
      ShiftRight: false,
      AltLeft: false,
      AltRight: false,
    });
    expect(Object.values(state).every((down) => !down)).toBe(true);
  });

  it('tracks canvas keydown and window keyup independently for multiple keys', () => {
    keyEvent(canvas, 'keydown');
    keyEvent(canvas, 'keydown', { code: 'Enter' });
    expect(state).toMatchObject({ Space: true, Enter: true });

    keyEvent(window, 'keyup');
    expect(state).toMatchObject({ Space: false, Enter: true });
    keyEvent(window, 'keyup', { code: 'Enter' });
    expect(state.Enter).toBe(false);
  });

  it('tracks a physical key even when Shift changes its printable value', () => {
    keyEvent(canvas, 'keydown', { code: 'KeyW', key: 'W', shiftKey: true });
    expect(state.KeyW).toBe(true);

    keyEvent(window, 'keyup', { code: 'KeyW', key: 'w' });
    expect(state.KeyW).toBe(false);
  });

  it('tracks remappable keys across keyboard sections', () => {
    for (const code of ['Digit7', 'BracketLeft', 'F24', 'NumpadEnter', 'IntlBackslash'] as const) {
      keyEvent(canvas, 'keydown', { code });
      expect(state[code]).toBe(true);

      keyEvent(window, 'keyup', { code });
      expect(state[code]).toBe(false);
    }
  });

  it('ignores empty, unidentified and unsupported codes without adding map entries', () => {
    const initialState = state;

    for (const code of ['', 'Unidentified', 'NotARealCode']) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      expect(Object.hasOwn(state, code)).toBe(false);
    }

    expect(state).toBe(initialState);
    expect(emissions).toBe(1);
  });

  it('ignores keydown outside the canvas', () => {
    keyEvent(window, 'keydown');
    keyEvent(document.body, 'keydown');
    expect(state.Space).toBe(false);
    expect(emissions).toBe(1);
  });

  it('ignores keydown when another handler has prevented its default', () => {
    const event = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    event.preventDefault();
    canvas.dispatchEvent(event);
    expect(state.Space).toBe(false);
    expect(emissions).toBe(1);
  });

  it('still releases keys when keyup has its default prevented', () => {
    keyEvent(canvas, 'keydown');
    const event = new KeyboardEvent('keyup', { code: 'Space', cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(state.Space).toBe(false);
  });

  it('ignores disabled keydown and resumes after being enabled', () => {
    input.setEnabled(false);
    const emissionsAfterDisabling = emissions;
    keyEvent(canvas, 'keydown', { ctrlKey: true, shiftKey: true, altKey: true });
    expect(state).toMatchObject({ Space: false, ControlLeft: false, ShiftLeft: false, AltLeft: false });
    expect(emissions).toBe(emissionsAfterDisabling);

    input.setEnabled(true);
    keyEvent(canvas, 'keydown');
    expect(state.Space).toBe(true);
  });

  it('allows held keys to be released while input is disabled', () => {
    keyEvent(canvas, 'keydown', { code: 'ControlLeft', ctrlKey: true });
    keyEvent(canvas, 'keydown', { code: 'ShiftLeft', ctrlKey: true, shiftKey: true });
    keyEvent(canvas, 'keydown', { code: 'AltLeft', ctrlKey: true, shiftKey: true, altKey: true });
    keyEvent(canvas, 'keydown', { ctrlKey: true, shiftKey: true, altKey: true });
    input.setEnabled(false);
    keyEvent(window, 'keyup', { ctrlKey: true, shiftKey: true, altKey: true });
    keyEvent(window, 'keyup', { code: 'ControlLeft', shiftKey: true, altKey: true });
    keyEvent(window, 'keyup', { code: 'ShiftLeft', altKey: true });
    keyEvent(window, 'keyup', { code: 'AltLeft' });
    expect(state).toMatchObject({ Space: false, ControlLeft: false, ShiftLeft: false, AltLeft: false });
  });

  it.each([
    ['ControlLeft', 'ControlRight', 'ctrlKey'],
    ['ShiftLeft', 'ShiftRight', 'shiftKey'],
    ['AltLeft', 'AltRight', 'altKey'],
  ] as const)('tracks %s and %s independently', (left, right, modifier) => {
    keyEvent(canvas, 'keydown', { code: left, [modifier]: true });
    keyEvent(canvas, 'keydown', { code: right, [modifier]: true });
    expect(state).toMatchObject({ [left]: true, [right]: true });

    keyEvent(window, 'keyup', { code: left, [modifier]: true });
    expect(state).toMatchObject({ [left]: false, [right]: true });
    keyEvent(window, 'keyup', { code: right });
    expect(state).toMatchObject({ [left]: false, [right]: false });
  });

  it('clears held keys and modifiers and continues accepting input', () => {
    keyEvent(canvas, 'keydown', { code: 'ControlLeft', ctrlKey: true });
    keyEvent(canvas, 'keydown', { code: 'ShiftLeft', shiftKey: true });
    keyEvent(canvas, 'keydown', { code: 'AltLeft', altKey: true });
    keyEvent(canvas, 'keydown', { ctrlKey: true, shiftKey: true, altKey: true });
    input.clear();
    expect(Object.values(state).every((down) => !down)).toBe(true);

    keyEvent(canvas, 'keydown');
    expect(state.Space).toBe(true);
  });

  it.each(['focus', 'visibility'])('clears held keys when browser %s is lost', (activity) => {
    keyEvent(canvas, 'keydown', { code: 'ControlLeft', ctrlKey: true });
    keyEvent(canvas, 'keydown', { code: 'ShiftLeft', shiftKey: true });
    keyEvent(canvas, 'keydown', { code: 'AltLeft', altKey: true });
    keyEvent(canvas, 'keydown', { ctrlKey: true, shiftKey: true, altKey: true });
    const source = activity === 'focus' ? hasFocus : visible;
    source.next(false);
    expect(Object.values(state).every((down) => !down)).toBe(true);

    source.next(true);
    expect(state.Space).toBe(false);
    keyEvent(canvas, 'keydown');
    expect(state.Space).toBe(true);
  });

  it('clears state on disposal and stops listening to keyboard and browser activity', () => {
    keyEvent(canvas, 'keydown', { code: 'ControlLeft', ctrlKey: true });
    keyEvent(canvas, 'keydown', { ctrlKey: true });
    input.dispose();
    expect(Object.values(state).every((down) => !down)).toBe(true);
    const emissionsAfterDisposal = emissions;

    keyEvent(canvas, 'keydown');
    keyEvent(window, 'keyup');
    hasFocus.next(false);
    visible.next(false);
    expect(emissions).toBe(emissionsAfterDisposal);
    expect(state.Space).toBe(false);
  });
});
