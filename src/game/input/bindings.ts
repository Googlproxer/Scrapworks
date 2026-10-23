import type { KeyCode } from './key-codes';

export type PadButton =
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'leftShoulder'
  | 'rightShoulder'
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
