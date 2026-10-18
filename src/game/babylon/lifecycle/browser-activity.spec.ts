import type { Subscription } from 'rxjs';
import type { ReadonlyKeyMap } from '../input/key-map';
import { ViewportInput } from '../input/viewport-input';
import { BrowserActivity } from './browser-activity';

describe('BrowserActivity', () => {
  const windowEventTypes = new Set(['focus', 'blur', 'beforeunload']);
  const documentEventTypes = new Set(['visibilitychange', 'focus', 'blur']);

  let previousActivity: BrowserActivity | undefined;
  let windowEvents: EventTarget;
  let documentEvents: EventTarget;
  let hidden: boolean;
  let focused: boolean;
  let visibleValues: boolean[];
  let focusValues: boolean[];
  let subscriptions: Subscription[];
  let inputs: ViewportInput[];
  let elements: HTMLElement[];

  beforeEach(() => {
    previousActivity = BrowserActivity.Instance;
    Reflect.deleteProperty(BrowserActivity, 'Instance');
    windowEvents = new EventTarget();
    documentEvents = new EventTarget();
    hidden = false;
    focused = true;
    visibleValues = [];
    focusValues = [];
    subscriptions = [];
    inputs = [];
    elements = [];

    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);

    // Isolate newly registered activity listeners so unloading a fixture cannot
    // stop a singleton created by another suite. Other browser events stay native.
    const addWindowListener = window.addEventListener.bind(window);
    const removeWindowListener = window.removeEventListener.bind(window);
    const addDocumentListener = document.addEventListener.bind(document);
    const removeDocumentListener = document.removeEventListener.bind(document);

    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (windowEventTypes.has(type)) windowEvents.addEventListener(type, listener, options);
      else addWindowListener(type, listener, options);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (windowEventTypes.has(type)) windowEvents.removeEventListener(type, listener, options);
      else removeWindowListener(type, listener, options);
    });
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      if (documentEventTypes.has(type)) documentEvents.addEventListener(type, listener, options);
      else addDocumentListener(type, listener, options);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (documentEventTypes.has(type)) documentEvents.removeEventListener(type, listener, options);
      else removeDocumentListener(type, listener, options);
    });
  });

  afterEach(() => {
    for (const input of inputs) input.dispose();
    windowEvents.dispatchEvent(new Event('beforeunload'));
    for (const subscription of subscriptions) subscription.unsubscribe();
    for (const element of elements) element.remove();
    if (previousActivity === undefined) Reflect.deleteProperty(BrowserActivity, 'Instance');
    else BrowserActivity.Instance = previousActivity;
    vi.restoreAllMocks();
  });

  function createActivity(): BrowserActivity {
    const activity = new BrowserActivity();
    subscriptions.push(
      activity.visibleObs.subscribe((value) => visibleValues.push(value)),
      activity.hasFocusObs.subscribe((value) => focusValues.push(value)),
    );
    return activity;
  }

  it.each([
    { hidden: false, focused: true },
    { hidden: false, focused: false },
    { hidden: true, focused: true },
    { hidden: true, focused: false },
  ])('initializes and immediately publishes state when hidden=$hidden and focused=$focused', (initial) => {
    hidden = initial.hidden;
    focused = initial.focused;

    const activity = createActivity();

    expect(activity.isVisible).toBe(!hidden);
    expect(activity.hasFocus).toBe(focused);
    expect(visibleValues).toEqual([!hidden]);
    expect(focusValues).toEqual([focused]);
  });

  it('reuses the singleton without registering duplicate activity listeners', () => {
    const activity = createActivity();

    expect(BrowserActivity.Instance).toBe(activity);
    expect(new BrowserActivity()).toBe(activity);

    focused = false;
    windowEvents.dispatchEvent(new FocusEvent('blur'));
    expect(focusValues).toEqual([true, false]);
  });

  it('updates visibility from document events without changing focus', () => {
    const activity = createActivity();

    hidden = true;
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(activity.isVisible).toBe(false);

    hidden = false;
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(activity.isVisible).toBe(true);
    expect(visibleValues).toEqual([true, false, true]);
    expect(focusValues).toEqual([true]);
  });

  it('updates focus from window blur and focus without changing visibility', () => {
    const activity = createActivity();

    focused = false;
    windowEvents.dispatchEvent(new FocusEvent('blur'));
    expect(activity.hasFocus).toBe(false);

    focused = true;
    windowEvents.dispatchEvent(new FocusEvent('focus'));
    expect(activity.hasFocus).toBe(true);
    expect(focusValues).toEqual([true, false, true]);
    expect(visibleValues).toEqual([true]);
  });

  it('reads the current active element after focus moves between controls', () => {
    const activity = createActivity();
    const first = document.createElement('button');
    const second = document.createElement('input');
    elements.push(first, second);
    document.body.append(first, second);

    first.focus();
    expect(activity.activeElement).toBe(first);

    second.focus();
    expect(activity.activeElement).toBe(second);
  });

  it('immediately gives late subscribers the latest visibility and focus', () => {
    const activity = createActivity();
    hidden = true;
    focused = false;
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    windowEvents.dispatchEvent(new FocusEvent('blur'));

    const lateVisibility: boolean[] = [];
    const lateFocus: boolean[] = [];
    subscriptions.push(
      activity.visibleObs.subscribe((value) => lateVisibility.push(value)),
      activity.hasFocusObs.subscribe((value) => lateFocus.push(value)),
    );

    expect(lateVisibility).toEqual([false]);
    expect(lateFocus).toEqual([false]);
  });

  it('stops observing document and window events after unloading', () => {
    const activity = createActivity();

    windowEvents.dispatchEvent(new Event('beforeunload'));
    hidden = true;
    focused = false;
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    windowEvents.dispatchEvent(new FocusEvent('blur'));
    windowEvents.dispatchEvent(new FocusEvent('focus'));

    expect(visibleValues).toEqual([true]);
    expect(focusValues).toEqual([true]);
    expect(activity.isVisible).toBe(true);
    expect(activity.hasFocus).toBe(true);
  });

  it('removes the registered unload callback and runs cleanup only once', () => {
    createActivity();
    const registration = vi.mocked(window.addEventListener).mock.calls.find(([type]) => type === 'beforeunload');
    expect(registration).toBeDefined();
    const registeredCallback = registration?.[1];
    const removeListener = vi.mocked(window.removeEventListener);

    windowEvents.dispatchEvent(new Event('beforeunload'));
    expect(removeListener).toHaveBeenCalledWith('beforeunload', registeredCallback);
    expect(removeListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);

    windowEvents.dispatchEvent(new Event('beforeunload'));
    expect(removeListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
  });

  it.each(['focus', 'visibility'] as const)('clears held viewport input when browser %s is lost', (reason) => {
    createActivity();
    const canvas = document.createElement('canvas');
    elements.push(canvas);
    document.body.append(canvas);
    const input = new ViewportInput(canvas);
    inputs.push(input);
    const states: ReadonlyKeyMap[] = [];
    subscriptions.push(input.stateObs.subscribe((state) => states.push(state)));

    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(states.at(-1)?.KeyW).toBe(true);

    if (reason === 'focus') {
      focused = false;
      windowEvents.dispatchEvent(new FocusEvent('blur'));
    } else {
      hidden = true;
      documentEvents.dispatchEvent(new Event('visibilitychange'));
    }

    expect(states.at(-1)?.KeyW).toBe(false);
    expect(Object.values(states.at(-1) ?? {}).every((down) => !down)).toBe(true);
  });
});
