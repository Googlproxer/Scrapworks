import {
  DeviceSourceManager,
  DeviceType,
  DualSenseInput,
  IKeyboardEvent,
  IPointerEvent,
  IWheelEvent,
  PointerInput,
  Vector2,
  XboxInput,
} from '@babylonjs/core';
import type { ButtonControl, MouseButton, PadButton } from './bindings';
import { ActionEvaluator } from './evaluator/evaluator';
import { controlId } from './evaluator/evaluator.helpers';
import type { RawInput } from './evaluator/evaluator.types';
import { isKeyCode } from './key-codes';

const xboxButtons = {
  south: XboxInput.A,
  east: XboxInput.B,
  west: XboxInput.X,
  north: XboxInput.Y,
  leftShoulder: XboxInput.LB,
  rightShoulder: XboxInput.RB,
  leftStick: XboxInput.LS,
  rightStick: XboxInput.RS,
  start: XboxInput.Start,
  select: XboxInput.Back,
  dpadUp: XboxInput.DPadUp,
  dpadDown: XboxInput.DPadDown,
  dpadLeft: XboxInput.DPadLeft,
  dpadRight: XboxInput.DPadRight,
} satisfies Record<PadButton, XboxInput>;

const dualSenseButtons = {
  south: DualSenseInput.Cross,
  east: DualSenseInput.Circle,
  west: DualSenseInput.Square,
  north: DualSenseInput.Triangle,
  leftShoulder: DualSenseInput.L1,
  rightShoulder: DualSenseInput.R1,
  leftStick: DualSenseInput.L3,
  rightStick: DualSenseInput.R3,
  start: DualSenseInput.Options,
  select: DualSenseInput.Create,
  dpadUp: DualSenseInput.DPadUp,
  dpadDown: DualSenseInput.DPadDown,
  dpadLeft: DualSenseInput.DPadLeft,
  dpadRight: DualSenseInput.DPadRight,
} satisfies Record<PadButton, DualSenseInput>;

const mouseButtons: Partial<Record<PointerInput, MouseButton>> = {
  [PointerInput.LeftClick]: 'primary',
  [PointerInput.MiddleClick]: 'middle',
  [PointerInput.RightClick]: 'secondary',
  [PointerInput.BrowserBack]: 'back',
  [PointerInput.BrowserForward]: 'forward',
};

export class InputCapture {
  private down = new Set<string>();
  private sticks: RawInput['sticks'] = { left: Vector2.Zero(), right: Vector2.Zero() };

  constructor(
    private readonly dsm: DeviceSourceManager,
    private evaluator: ActionEvaluator,
  ) {}

  public updateEvaluator(evaluator: ActionEvaluator) {
    this.evaluator = evaluator;
    this.publish();
  }

  public publish() {
    this.evaluator.sample({ down: new Set(this.down), sticks: this.sticks });
  }

  private writeButton(control: ButtonControl, held: boolean): void {
    const id = controlId(control);
    if (this.down.has(id) === held) return;

    if (held) this.down.add(id);
    else this.down.delete(id);

    this.publish();
  }

  // Call after the event owner has accepted this keydown.
  public onKeyboard(event: IKeyboardEvent): void {
    if (!isKeyCode(event.code)) return;
    if (event.type !== 'keydown' && event.type !== 'keyup') return;

    const held = event.type === 'keydown';

    if (held) {
      if ('defaultPrevented' in event && event.defaultPrevented) return;

      event.preventDefault();
      if (event.repeat) return;
    }

    this.writeButton({ device: 'keyboard', code: event.code }, held);
  }

  public onMouse(event: IPointerEvent | IWheelEvent): void {
    if (event.type !== 'pointerdown' && event.type !== 'pointerup') return;

    const button = mouseButtons[event.inputIndex];

    if (button) {
      this.writeButton({ device: 'mouse', button }, event.type === 'pointerdown');
    }
  }

  public pollXbox(slot: number): void {
    const source = this.dsm.getDeviceSource(DeviceType.Xbox, slot);

    for (const name of Object.keys(xboxButtons) as PadButton[]) {
      const id = controlId({ device: 'gamepad', button: name });

      if (source && source.getInput(xboxButtons[name]) >= 0.5) {
        this.down.add(id);
      } else {
        this.down.delete(id);
      }
    }

    this.sticks = source
      ? {
          left: {
            x: source.getInput(XboxInput.LStickXAxis),
            y: -source.getInput(XboxInput.LStickYAxis),
          },
          right: {
            x: source.getInput(XboxInput.RStickXAxis),
            y: -source.getInput(XboxInput.RStickYAxis),
          },
        }
      : { left: Vector2.Zero(), right: Vector2.Zero() };

    // Publish controller buttons and axes together.
    this.publish();
  }

  public clearDevice(device: ButtonControl['device']): void {
    for (const id of this.down) {
      if (id.startsWith(device + ':')) this.down.delete(id);
    }

    if (device === 'gamepad') {
      this.sticks = { left: Vector2.Zero(), right: Vector2.Zero() };
    }

    this.publish();
  }
}
