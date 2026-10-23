import { actions, defaultProfile, type BindingProfile } from '../bindings';
import { ActionEvaluator } from './evaluator';
import { compileRules } from './evaluator.helpers';
import type { ActionFrame, ButtonState, RawInput } from './evaluator.types';

describe('ActionEvaluator', () => {
  let evaluator: ActionEvaluator;

  beforeEach(() => {
    evaluator = createEvaluator();
    evaluator.setContext('gameplay');
  });

  function createEvaluator(profile: BindingProfile = defaultProfile): ActionEvaluator {
    return new ActionEvaluator({
      gameplay: compileRules(actions.gameplay, profile.contexts.gameplay),
      ui: compileRules(actions.ui, profile.contexts.ui),
    });
  }

  function sample(
    down: readonly string[] = [],
    left = { x: 0, y: 0 },
    right = { x: 0, y: 0 },
  ): void {
    const raw: RawInput = { down: new Set(down), sticks: { left, right } };
    evaluator.sample(raw);
  }

  function button(frame: ActionFrame, name: string): ButtonState {
    const state = frame.states[name];
    if (state?.kind !== 'button') throw new Error('Expected button: ' + name);
    return state;
  }

  function vector(frame: ActionFrame, name: string) {
    const state = frame.states[name];
    if (state?.kind !== 'vector2') throw new Error('Expected vector: ' + name);
    return state.value;
  }

  it('starts without an active context and emits no actions before activation', () => {
    evaluator = createEvaluator();
    sample(['keyboard:Space']);
    expect(evaluator.takeFrame()).toMatchObject({ context: null, states: {} });
    evaluator.setContext('gameplay');
    expect(button(evaluator.takeFrame(), 'jump').held).toBe(false);
  });

  it('evaluates sprint, forward, jump and strafe simultaneously', () => {
    sample(['keyboard:ShiftLeft', 'keyboard:KeyW', 'keyboard:Space', 'keyboard:KeyD']);
    const frame = evaluator.takeFrame();
    expect(button(frame, 'jump')).toMatchObject({ held: true, pressed: true });
    expect(button(frame, 'sprint').held).toBe(true);
    expect(vector(frame, 'move').x).toBeCloseTo(Math.SQRT1_2);
    expect(vector(frame, 'move').y).toBeCloseTo(Math.SQRT1_2);
    sample(['keyboard:ShiftLeft', 'keyboard:KeyW', 'keyboard:KeyD']);
    const released = evaluator.takeFrame();
    expect(button(released, 'jump')).toMatchObject({ held: false, released: true });
    expect(button(released, 'sprint').held).toBe(true);
    expect(vector(released, 'move').x).toBeGreaterThan(0);
  });

  it('cancels opposing directions without cancelling the other axis', () => {
    sample(['keyboard:KeyW', 'keyboard:KeyA', 'keyboard:KeyD']);
    expect(vector(evaluator.takeFrame(), 'move')).toMatchObject({ x: 0, y: 1 });
  });

  it('aggregates multiple button bindings without false releases or extra presses', () => {
    sample(['keyboard:Space', 'gamepad:south']);
    expect(button(evaluator.takeFrame(), 'jump').pressed).toBe(true);
    sample(['gamepad:south']);
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: true,
      pressed: false,
      released: false,
    });
    sample();
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: false,
      pressed: false,
      released: true,
    });
  });

  it('preserves a quick tap until one consumer frame and then clears the edges', () => {
    sample(['keyboard:Space']);
    sample();
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: false,
      pressed: true,
      released: true,
    });
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: false,
      pressed: false,
      released: false,
    });
  });

  it('retains held state without repeating press edges and preserves old snapshots', () => {
    sample(['keyboard:Space']);
    const first = evaluator.takeFrame();
    sample(['keyboard:Space']);
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: true,
      pressed: false,
      released: false,
    });
    sample();
    evaluator.takeFrame();
    expect(button(first, 'jump')).toMatchObject({ held: true, pressed: true, released: false });
  });

  it('removes radial stick drift and rescales the remaining analog range', () => {
    sample([], { x: 0.1, y: 0.1 });
    expect(vector(evaluator.takeFrame(), 'move')).toMatchObject({ x: 0, y: 0 });
    sample([], { x: 0.59, y: 0 });
    expect(vector(evaluator.takeFrame(), 'move').x).toBeCloseTo(0.5);
    sample([], { x: 1, y: 1 });
    const diagonal = vector(evaluator.takeFrame(), 'move');
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });

  it('uses the strongest vector and preserves binding order on equal magnitudes', () => {
    sample(['keyboard:KeyW'], { x: 1, y: 0 });
    expect(vector(evaluator.takeFrame(), 'move')).toMatchObject({ x: 0, y: 1 });
    sample([], { x: 0.59, y: 0 });
    expect(vector(evaluator.takeFrame(), 'move').x).toBeCloseTo(0.5);
  });

  it('maps the same controller button independently in gameplay and UI', () => {
    sample(['gamepad:south']);
    expect(button(evaluator.takeFrame(), 'jump').pressed).toBe(true);
    evaluator.setContext('ui');
    const entering = evaluator.takeFrame();
    expect(entering.states['jump']).toBeUndefined();
    expect(button(entering, 'submit').held).toBe(false);
    sample();
    sample(['gamepad:south']);
    expect(button(evaluator.takeFrame(), 'submit').pressed).toBe(true);
  });

  it('requires release before the opening Escape key can cancel a menu', () => {
    sample(['keyboard:Escape']);
    const gameplay = evaluator.takeFrame();
    expect(button(gameplay, 'menu').pressed).toBe(true);
    evaluator.setContext('ui');
    expect(evaluator.isCurrent(gameplay)).toBe(false);
    expect(button(evaluator.takeFrame(), 'cancel')).toMatchObject({
      held: false,
      pressed: false,
      released: false,
    });
    sample();
    expect(button(evaluator.takeFrame(), 'cancel').released).toBe(false);
    sample(['keyboard:Escape']);
    expect(button(evaluator.takeFrame(), 'cancel').pressed).toBe(true);
  });

  it('requires a deflected stick to return within the new context deadzone', () => {
    sample([], { x: 0, y: 1 });
    evaluator.setContext('ui');
    expect(vector(evaluator.takeFrame(), 'navigate')).toMatchObject({ x: 0, y: 0 });
    sample([], { x: 0, y: 0.5 });
    expect(vector(evaluator.takeFrame(), 'navigate').y).toBe(0);
    sample([], { x: 0.1, y: 0 });
    sample([], { x: 0, y: 1 });
    expect(vector(evaluator.takeFrame(), 'navigate').y).toBe(1);
  });

  it('cancels on suspension without synthesising releases and gates held input on resume', () => {
    sample(['keyboard:Space']);
    evaluator.takeFrame();
    evaluator.setContext(null);
    expect(evaluator.takeFrame()).toMatchObject({ context: null, states: {} });
    sample(['keyboard:Space']);
    evaluator.setContext('gameplay');
    expect(button(evaluator.takeFrame(), 'jump')).toMatchObject({
      held: false,
      pressed: false,
      released: false,
    });
    sample();
    sample(['keyboard:Space']);
    expect(button(evaluator.takeFrame(), 'jump').pressed).toBe(true);
  });

  it('does not reset held actions or invalidate a frame when the context is unchanged', () => {
    sample(['keyboard:Space']);
    const frame = evaluator.takeFrame();
    evaluator.setContext('gameplay');
    expect(evaluator.isCurrent(frame)).toBe(true);
    expect(button(evaluator.takeFrame(), 'jump').held).toBe(true);
  });

  it('uses configured physical Ctrl, Alt and Tab controls as ordinary inputs', () => {
    evaluator = createEvaluator({
      ...defaultProfile,
      contexts: {
        ...defaultProfile.contexts,
        gameplay: {
          ...defaultProfile.contexts.gameplay,
          jump: [{ device: 'keyboard', code: 'Tab' }],
          sprint: [
            { device: 'keyboard', code: 'ControlLeft' },
            { device: 'keyboard', code: 'ControlRight' },
          ],
          interact: [{ device: 'keyboard', code: 'AltLeft' }],
        },
      },
    });
    evaluator.setContext('gameplay');
    sample([
      'keyboard:ControlLeft',
      'keyboard:ControlRight',
      'keyboard:AltLeft',
      'keyboard:Tab',
      'keyboard:KeyW',
      'keyboard:KeyD',
    ]);
    const frame = evaluator.takeFrame();
    expect(button(frame, 'jump').held).toBe(true);
    expect(button(frame, 'sprint').held).toBe(true);
    expect(button(frame, 'interact').held).toBe(true);
    sample(['keyboard:ControlRight']);
    expect(button(evaluator.takeFrame(), 'sprint').released).toBe(false);
  });

  it('treats an empty binding array as unbound instead of restoring defaults', () => {
    evaluator = createEvaluator({
      ...defaultProfile,
      contexts: {
        ...defaultProfile.contexts,
        gameplay: { ...defaultProfile.contexts.gameplay, jump: [] },
      },
    });
    evaluator.setContext('gameplay');
    sample(['keyboard:Space', 'gamepad:south']);
    expect(button(evaluator.takeFrame(), 'jump').held).toBe(false);
  });

  it('evaluates remapped keyboard sections and ignores the replaced defaults', () => {
    evaluator = createEvaluator({
      ...defaultProfile,
      contexts: {
        ...defaultProfile.contexts,
        gameplay: {
          ...defaultProfile.contexts.gameplay,
          jump: [{ device: 'keyboard', code: 'NumpadEnter' }],
          sprint: [{ device: 'keyboard', code: 'IntlBackslash' }],
        },
      },
    });
    evaluator.setContext('gameplay');
    sample(['keyboard:Space', 'keyboard:ShiftLeft']);
    expect(button(evaluator.takeFrame(), 'jump').held).toBe(false);
    sample(['keyboard:NumpadEnter', 'keyboard:IntlBackslash']);
    const frame = evaluator.takeFrame();
    expect(button(frame, 'jump').held).toBe(true);
    expect(button(frame, 'sprint').held).toBe(true);
  });
});
