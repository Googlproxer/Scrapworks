/**
 * Physical keyboard codes supported for held input and future control bindings.
 * Source: https://www.w3.org/TR/uievents-code/
 * Special keys are usable only when the browser receives their keyboard events.
 */
export const keyCodes = [
  // Letters
  'KeyA',
  'KeyB',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyM',
  'KeyN',
  'KeyO',
  'KeyP',
  'KeyQ',
  'KeyR',
  'KeyS',
  'KeyT',
  'KeyU',
  'KeyV',
  'KeyW',
  'KeyX',
  'KeyY',
  'KeyZ',

  // Number row
  'Digit0',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',

  // Punctuation
  'Backquote',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',

  // Editing and whitespace
  'Backspace',
  'Tab',
  'Enter',
  'Space',
  'Escape',

  // Navigation and arrows
  'Insert',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Help',

  // Modifiers and lock keys
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',

  // Function keys
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
  'F20',
  'F21',
  'F22',
  'F23',
  'F24',
  'Fn',
  'FnLock',
  'PrintScreen',
  'Pause',

  // Numpad
  'Numpad0',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
  'NumpadComma',
  'NumpadEnter',
  'NumpadEqual',
  'NumpadBackspace',
  'NumpadClear',
  'NumpadClearEntry',
  'NumpadHash',
  'NumpadStar',
  'NumpadParenLeft',
  'NumpadParenRight',
  'NumpadMemoryAdd',
  'NumpadMemoryClear',
  'NumpadMemoryRecall',
  'NumpadMemoryStore',
  'NumpadMemorySubtract',

  // International layouts and input modes
  'IntlBackslash',
  'IntlRo',
  'IntlYen',
  'Convert',
  'NonConvert',
  'KanaMode',
  'Lang1',
  'Lang2',
  'Lang3',
  'Lang4',
  'Lang5',
  'Hiragana',
  'Katakana',

  // Media, volume and browser keys
  'AudioVolumeMute',
  'AudioVolumeDown',
  'AudioVolumeUp',
  'MediaPlayPause',
  'MediaStop',
  'MediaTrackPrevious',
  'MediaTrackNext',
  'MediaSelect',
  'Eject',
  'BrowserBack',
  'BrowserForward',
  'BrowserRefresh',
  'BrowserStop',
  'BrowserSearch',
  'BrowserFavorites',
  'BrowserHome',
  'LaunchMail',
  'LaunchApp1',
  'LaunchApp2',

  // System keys
  'Power',
  'Sleep',
  'WakeUp',
] as const;

export type KeyCode = (typeof keyCodes)[number];

const supportedCodes = new Set<string>(keyCodes);

export function isKeyCode(code: string): code is KeyCode {
  return supportedCodes.has(code);
}

export type PadButton =
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftTrigger'
  | 'rightTrigger'
  | 'leftStick'
  | 'rightStick'
  | 'start'
  | 'select'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight';

export type MouseButton = 'primary' | 'middle' | 'secondary' | 'back' | 'forward';

export type ButtonControl =
  | { readonly device: 'keyboard'; readonly code: KeyCode }
  | { readonly device: 'mouse'; readonly button: MouseButton }
  | { readonly device: 'gamepad'; readonly button: PadButton };

export type Vector2Binding =
  | {
      readonly kind: 'buttons2d';
      readonly up: ButtonControl;
      readonly down: ButtonControl;
      readonly left: ButtonControl;
      readonly right: ButtonControl;
    }
  | {
      readonly kind: 'stick2d';
      readonly stick: 'left' | 'right';
      readonly deadzone: number;
    };

export const actions = {
  gameplay: {
    move: 'vector2',
    orbit: 'vector2',
    zoomIn: 'button',
    zoomOut: 'button',
    rotatePlacement: 'button',
    build: 'button',
    confirm: 'button',
    cancel: 'button',
    jump: 'button',
    sprint: 'button',
    interact: 'button',
    inventory: 'button',
    menu: 'button',
  },
  ui: {
    navigate: 'vector2',
    submit: 'button',
    cancel: 'button',
  },
} as const;

type BindingFor<K> = K extends 'button'
  ? ButtonControl
  : K extends 'vector2'
    ? Vector2Binding
    : never;

export interface BindingProfile {
  readonly schemaVersion: 1;
  readonly contexts: {
    readonly [C in keyof typeof actions]: {
      readonly [A in keyof (typeof actions)[C]]: readonly BindingFor<(typeof actions)[C][A]>[];
    };
  };
}

const key = (code: KeyCode): ButtonControl => ({ device: 'keyboard', code });

const mouse = (button: MouseButton): ButtonControl => ({ device: 'mouse', button });

const pad = (button: PadButton): ButtonControl => ({ device: 'gamepad', button });

const directions = (
  up: ButtonControl,
  down: ButtonControl,
  left: ButtonControl,
  right: ButtonControl,
): Vector2Binding => ({
  kind: 'buttons2d',
  up,
  down,
  left,
  right,
});

export const defaultProfile = {
  schemaVersion: 1,
  contexts: {
    gameplay: {
      move: [
        directions(key('KeyW'), key('KeyS'), key('KeyA'), key('KeyD')),
        { kind: 'stick2d', stick: 'left', deadzone: 0.18 },
      ],
      orbit: [{ kind: 'stick2d', stick: 'right', deadzone: 0.18 }],
      zoomIn: [key('Equal'), pad('rightTrigger')],
      zoomOut: [key('Minus'), pad('leftTrigger')],
      rotatePlacement: [key('KeyR'), pad('rightShoulder')],
      build: [key('KeyB'), pad('select')],
      confirm: [mouse('primary'), pad('south')],
      cancel: [key('Escape'), pad('east')],
      jump: [key('Space'), pad('south')],
      sprint: [key('ShiftLeft'), pad('leftStick')],
      interact: [key('KeyE'), mouse('primary'), pad('west')],
      inventory: [key('Tab'), pad('north')],
      menu: [key('Escape'), pad('start')],
    },

    ui: {
      navigate: [
        directions(key('ArrowUp'), key('ArrowDown'), key('ArrowLeft'), key('ArrowRight')),
        directions(pad('dpadUp'), pad('dpadDown'), pad('dpadLeft'), pad('dpadRight')),
        { kind: 'stick2d', stick: 'left', deadzone: 0.25 },
      ],
      submit: [key('Enter'), pad('south')],
      cancel: [key('Escape'), pad('east')],
    },
  },
} as const satisfies BindingProfile;

export interface InputVector {
  readonly x: number;
  readonly y: number;
}

export type Context = keyof typeof actions;
export interface RawInput {
  readonly down: ReadonlySet<string>;
  readonly sticks: Readonly<Record<'left' | 'right', InputVector>>;
}
export type ButtonState = Readonly<{
  kind: 'button';
  held: boolean;
  pressed: boolean;
  released: boolean;
}>;
export type ActionState = ButtonState | Readonly<{ kind: 'vector2'; value: InputVector }>;
export interface ActionFrame {
  readonly context: Context | null;
  readonly revision: number;
  readonly states: Readonly<Record<string, ActionState>>;
}
export type ControllerType = 'xbox' | 'dualshock' | 'dualsense';
export interface ControllerInfo {
  readonly id: string;
  readonly type: ControllerType;
  readonly slot: number;
  readonly name: string;
  readonly selected: boolean;
}

export interface UiKeyInput {
  readonly code: string;
  readonly down: boolean;
  readonly repeat?: boolean;
  readonly composing?: boolean;
  readonly editable?: boolean;
}

export interface UiPointerInput {
  readonly button: number;
  readonly down: boolean;
}

const mouseButtons = new Set(['primary', 'middle', 'secondary', 'back', 'forward']);
const padButtons = new Set([
  'south',
  'east',
  'west',
  'north',
  'leftShoulder',
  'rightShoulder',
  'leftTrigger',
  'rightTrigger',
  'leftStick',
  'rightStick',
  'start',
  'select',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validButton(value: unknown): value is ButtonControl {
  if (!isRecord(value)) return false;
  switch (value['device']) {
    case 'keyboard':
      return typeof value['code'] === 'string' && isKeyCode(value['code']);
    case 'mouse':
      return typeof value['button'] === 'string' && mouseButtons.has(value['button']);
    case 'gamepad':
      return typeof value['button'] === 'string' && padButtons.has(value['button']);
    default:
      return false;
  }
}

function validVector(value: unknown): value is Vector2Binding {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'buttons2d')
    return ['up', 'down', 'left', 'right'].every((k) => validButton(value[k]));
  return (
    value['kind'] === 'stick2d' &&
    (value['stick'] === 'left' || value['stick'] === 'right') &&
    typeof value['deadzone'] === 'number' &&
    Number.isFinite(value['deadzone']) &&
    value['deadzone'] >= 0 &&
    value['deadzone'] < 1
  );
}

/** Validates all action bindings and returns a detached profile. Empty bindings stay unbound. */
export function validateBindingProfile(value: unknown): BindingProfile {
  if (!isRecord(value) || value['schemaVersion'] !== 1 || !isRecord(value['contexts']))
    throw new Error('Unsupported control profile');
  const contexts = value['contexts'];
  for (const context of Object.keys(actions) as Context[]) {
    const bindings = contexts[context];
    if (!isRecord(bindings)) throw new Error('Missing input context: ' + context);
    for (const [action, kind] of Object.entries(actions[context])) {
      const choices = bindings[action];
      if (!Array.isArray(choices) || !choices.every(kind === 'button' ? validButton : validVector))
        throw new Error('Invalid binding: ' + context + '.' + action);
    }
  }
  return JSON.parse(JSON.stringify(value)) as BindingProfile;
}
