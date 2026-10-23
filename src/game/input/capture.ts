import {
  DeviceSourceManager,
  DeviceType,
  DualSenseInput,
  DualShockInput,
  type IKeyboardEvent,
  type IPointerEvent,
  type IWheelEvent,
  PointerInput,
  XboxInput,
} from '@babylonjs/core';
import type { ButtonControl, MouseButton, PadButton, RawInput } from '@contracts/input';
import { ActionEvaluator } from './evaluator/evaluator';
import { controlId } from './evaluator/evaluator.helpers';
import { isKeyCode } from './key-codes';

const xboxButtons = {
  south: XboxInput.A,
  east: XboxInput.B,
  west: XboxInput.X,
  north: XboxInput.Y,
  leftShoulder: XboxInput.LB,
  rightShoulder: XboxInput.RB,
  leftTrigger: XboxInput.LT,
  rightTrigger: XboxInput.RT,
  leftStick: XboxInput.LS,
  rightStick: XboxInput.RS,
  start: XboxInput.Start,
  select: XboxInput.Back,
  dpadUp: XboxInput.DPadUp,
  dpadDown: XboxInput.DPadDown,
  dpadLeft: XboxInput.DPadLeft,
  dpadRight: XboxInput.DPadRight,
} satisfies Record<PadButton, number>;
const dualSenseButtons = {
  south: DualSenseInput.Cross,
  east: DualSenseInput.Circle,
  west: DualSenseInput.Square,
  north: DualSenseInput.Triangle,
  leftShoulder: DualSenseInput.L1,
  rightShoulder: DualSenseInput.R1,
  leftTrigger: DualSenseInput.L2,
  rightTrigger: DualSenseInput.R2,
  leftStick: DualSenseInput.L3,
  rightStick: DualSenseInput.R3,
  start: DualSenseInput.Options,
  select: DualSenseInput.Create,
  dpadUp: DualSenseInput.DPadUp,
  dpadDown: DualSenseInput.DPadDown,
  dpadLeft: DualSenseInput.DPadLeft,
  dpadRight: DualSenseInput.DPadRight,
} satisfies Record<PadButton, number>;
const dualShockButtons = { ...dualSenseButtons, select: DualShockInput.Share };

const mouseButtons: Partial<Record<number, MouseButton>> = {
  [PointerInput.LeftClick]: 'primary',
  [PointerInput.MiddleClick]: 'middle',
  [PointerInput.RightClick]: 'secondary',
  [PointerInput.BrowserBack]: 'back',
  [PointerInput.BrowserForward]: 'forward',
};

type KeyboardSample = Pick<IKeyboardEvent, 'type' | 'code' | 'repeat' | 'preventDefault'> & {
  readonly defaultPrevented?: boolean;
};

export class InputCapture {
  private readonly down = new Set<string>();
  private sticks: RawInput['sticks'] = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

  constructor(
    private readonly dsm: DeviceSourceManager,
    private evaluator: ActionEvaluator,
    private readonly onPress: (control: ButtonControl) => void = () => undefined,
    private readonly onControllerActivity: (
      current: RawInput['sticks'],
      previous: RawInput['sticks'],
      pressed: boolean,
    ) => void = () => undefined,
  ) {}

  public updateEvaluator(evaluator: ActionEvaluator): void {
    this.evaluator = evaluator;
    this.publish();
  }

  public publish(): void {
    this.evaluator.sample({ down: new Set(this.down), sticks: this.sticks });
  }

  private writeButton(control: ButtonControl, held: boolean): void {
    const id = controlId(control);
    if (this.down.has(id) === held) return;
    if (held) this.down.add(id);
    else this.down.delete(id);
    // Publish before notifying remapping: restoring a context must see held controls.
    this.publish();
    if (held) this.onPress(control);
  }

  public onKeyboard(event: KeyboardSample): void {
    if (!isKeyCode(event.code)) return;
    if (event.type !== 'keydown' && event.type !== 'keyup') return;
    const held = event.type === 'keydown';
    if (held) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.repeat) return;
    }
    this.writeButton({ device: 'keyboard', code: event.code }, held);
  }

  public onMouse(event: Pick<IPointerEvent | IWheelEvent, 'type' | 'inputIndex'>): void {
    if (event.type !== 'pointerdown' && event.type !== 'pointerup') return;
    const button = mouseButtons[event.inputIndex];
    if (button) this.writeButton({ device: 'mouse', button }, event.type === 'pointerdown');
  }

  public pollXbox(slot: number): void {
    this.pollController(DeviceType.Xbox, slot);
  }

  public pollController(
    type: DeviceType.Xbox | DeviceType.DualShock | DeviceType.DualSense,
    slot: number,
  ): void {
    const source = this.dsm.getDeviceSource(type, slot);
    const buttons =
      type === DeviceType.Xbox
        ? xboxButtons
        : type === DeviceType.DualShock
          ? dualShockButtons
          : dualSenseButtons;
    const presses: ButtonControl[] = [];
    for (const name of Object.keys(buttons) as PadButton[]) {
      const control: ButtonControl = { device: 'gamepad', button: name };
      const id = controlId(control);
      const held = source !== null && source.getInput(buttons[name]) >= 0.5;
      if (held && !this.down.has(id)) presses.push(control);
      if (held) this.down.add(id);
      else this.down.delete(id);
    }
    const axisStart = type === DeviceType.Xbox ? XboxInput.LStickXAxis : DualSenseInput.LStickXAxis;
    const axis = (offset: number) => {
      const value = source?.getInput(axisStart + offset) ?? 0;
      return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    };
    const previous = this.sticks;
    this.sticks = {
      left: { x: axis(0), y: -axis(1) || 0 },
      right: { x: axis(2), y: -axis(3) || 0 },
    };
    this.publish();
    this.onControllerActivity(this.sticks, previous, presses.length > 0);
    for (const control of presses) this.onPress(control);
  }

  public clearDevice(device: ButtonControl['device']): void {
    for (const id of this.down) if (id.startsWith(device + ':')) this.down.delete(id);
    if (device === 'gamepad') this.sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    this.publish();
  }
}
