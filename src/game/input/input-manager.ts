import { DeviceSourceManager, DeviceType, type Engine, type IKeyboardEvent } from '@babylonjs/core';
import type { DeviceSourceType } from '@babylonjs/core/DeviceInput/internalDeviceSourceManager';
import {
  actions,
  defaultProfile,
  isKeyCode,
  validateBindingProfile,
  type ActionFrame,
  type BindingProfile,
  type ButtonControl,
  type Context,
  type ControllerInfo,
  type ControllerType,
  type RawInput,
  type UiKeyInput,
  type UiPointerInput,
} from '@contracts/input';
import { BehaviorSubject, combineLatest, Subject, Subscription } from 'rxjs';
import { BrowserActivity } from '../lifecycle/browser-activity';
import { fromBabylonObservable } from '../lifecycle/from-babylon-observable';
import { InputCapture } from './capture';
import { ActionEvaluator } from './evaluator/evaluator';
import { compileRules } from './evaluator/evaluator.helpers';

const controllerTypes: Partial<Record<DeviceType, ControllerType>> = {
  [DeviceType.Xbox]: 'xbox',
  [DeviceType.DualShock]: 'dualshock',
  [DeviceType.DualSense]: 'dualsense',
};

/** Owns device capture and contexts; its consumer dispatches exactly one frame per update. */
export class InputManager {
  private readonly requestedEnabledSubject = new BehaviorSubject(true);
  private readonly viewportActiveSubject = new BehaviorSubject(false);
  private readonly requestedContextSubject = new BehaviorSubject<Context | null>('gameplay');
  private readonly enabledSubject = new BehaviorSubject(false);
  private readonly controllersSubject = new BehaviorSubject<readonly ControllerInfo[]>([]);
  private readonly subscriptions = new Subscription();
  private readonly deviceSubscriptions = new Map<string, Subscription>();
  private readonly controllers = new Map<string, DeviceSourceType>();
  private readonly rawInput = new Subject<ButtonControl>();
  private captures = 0;
  private readonly frameOwners = new WeakMap<ActionFrame, ActionEvaluator>();
  private readonly browserActivity: BrowserActivity;
  private readonly inputCapture: InputCapture;
  private readonly dsm!: DeviceSourceManager;
  private inputEvaluator: ActionEvaluator;
  private profile: BindingProfile;
  private selectedId: string | undefined;
  private disposed = false;
  private controllerTarget = false;
  public readonly enabledObs = this.enabledSubject.asObservable();

  constructor(
    engine: Engine,
    profile: BindingProfile = defaultProfile,
    ownerDocument: Document = engine.getInputElement()?.ownerDocument ?? document,
  ) {
    this.profile = validateBindingProfile(profile);
    this.inputEvaluator = this.createEvaluator();
    this.browserActivity = new BrowserActivity(ownerDocument);
    try {
      this.dsm = new DeviceSourceManager(engine);
      this.inputCapture = new InputCapture(
        this.dsm,
        this.inputEvaluator,
        (control) => this.onRawPress(control),
        (current, previous, pressed) => this.trackControllerActivity(current, previous, pressed),
      );
      this.subscriptions.add(
        fromBabylonObservable(this.dsm.onDeviceConnectedObservable).subscribe((device) =>
          this.connectDevice(device),
        ),
      );
      this.subscriptions.add(
        fromBabylonObservable(this.dsm.onDeviceDisconnectedObservable).subscribe((device) =>
          this.disconnectDevice(device),
        ),
      );
      this.subscriptions.add(
        combineLatest([
          this.requestedContextSubject,
          this.requestedEnabledSubject,
          this.viewportActiveSubject,
          this.browserActivity.hasFocusObs,
          this.browserActivity.visibleObs,
        ]).subscribe(() => this.refreshContext()),
      );
    } catch (error) {
      this.subscriptions.unsubscribe();
      for (const subscription of this.deviceSubscriptions.values()) subscription.unsubscribe();
      this.dsm?.dispose();
      this.browserActivity.release();
      throw error;
    }
  }

  public get enabled(): boolean {
    return this.enabledSubject.value;
  }

  public get isCapturing(): boolean {
    return this.captures > 0;
  }

  public get usingController(): boolean {
    return this.controllerTarget;
  }

  public markPointerActivity(): void {
    this.controllerTarget = false;
  }

  public setEnabled(on: boolean): void {
    if (!this.disposed) this.requestedEnabledSubject.next(on);
  }

  public setContext(context: Context | null): void {
    if (!this.disposed) this.requestedContextSubject.next(context);
  }

  public setViewportActive(active: boolean): void {
    if (!this.disposed) this.viewportActiveSubject.next(active);
  }

  public takeFrame(): ActionFrame {
    if (!this.disposed) this.pollController();
    const frame = this.inputEvaluator.takeFrame();
    this.frameOwners.set(frame, this.inputEvaluator);
    return frame;
  }

  public isCurrent(frame: ActionFrame): boolean {
    return (
      !this.disposed &&
      this.frameOwners.get(frame) === this.inputEvaluator &&
      this.inputEvaluator.isCurrent(frame)
    );
  }

  public clear(): void {
    const context = this.inputEvaluator.currentContext;
    this.inputEvaluator.setContext(null);
    this.inputCapture.clearDevice('keyboard');
    this.inputCapture.clearDevice('mouse');
    this.inputCapture.clearDevice('gamepad');
    if (!this.disposed) this.inputEvaluator.setContext(context);
  }

  public updateBindings(profile: BindingProfile): void {
    if (this.disposed) return;
    const validated = validateBindingProfile(profile);
    const context = this.inputEvaluator.currentContext;
    this.profile = validated;
    this.inputEvaluator = this.createEvaluator();
    this.inputCapture.updateEvaluator(this.inputEvaluator);
    // Physical state must be present before the new context blocks held controls.
    this.inputEvaluator.setContext(context);
  }

  public getControllers(): readonly ControllerInfo[] {
    return this.controllersSubject.value;
  }

  public subscribeControllers(
    listener: (controllers: readonly ControllerInfo[]) => void,
  ): () => void {
    const subscription = this.controllersSubject.subscribe(listener);
    return () => subscription.unsubscribe();
  }

  public selectController(id: string | null): boolean {
    if (this.disposed || (id !== null && !this.controllers.has(id))) return false;
    const selected = id ?? this.controllers.keys().next().value;
    if (this.selectedId === selected) return true;
    const context = this.inputEvaluator.currentContext;
    this.inputEvaluator.setContext(null);
    this.selectedId = selected;
    this.inputCapture.clearDevice('gamepad');
    this.pollController();
    this.inputEvaluator.setContext(context);
    this.publishControllers();
    return true;
  }

  /** Captures fresh button presses; action dispatch stays suspended until unsubscribed. */
  public subscribeRawInput(listener: (control: ButtonControl) => void): () => void {
    if (this.disposed) return () => undefined;
    const subscription = this.rawInput.subscribe(listener);
    ++this.captures;
    subscription.add(() => {
      --this.captures;
      this.refreshContext();
    });
    this.refreshContext();
    return () => subscription.unsubscribe();
  }

  public handleUiKeyboard(input: UiKeyInput): boolean {
    if (this.disposed) return false;
    if (this.requestedContextSubject.value !== 'ui') {
      // A key held before Inspector/ownership changes can be released anywhere.
      if (!input.down) this.acceptKeyboard(input, true);
      return false;
    }
    return this.acceptKeyboard(input, true);
  }

  public handleUiPointer(input: UiPointerInput): boolean {
    if (
      this.disposed ||
      (input.down &&
        (this.requestedContextSubject.value !== 'ui' || !this.isCapturing || !this.browserActive()))
    )
      return false;
    if (input.button < 0 || input.button > 4) return false;
    this.markPointerActivity();
    const capturing = this.isCapturing;
    this.inputCapture.onMouse({
      type: input.down ? 'pointerdown' : 'pointerup',
      inputIndex: input.button + 2,
    });
    return capturing;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.refreshContext();
    this.subscriptions.unsubscribe();
    for (const subscription of this.deviceSubscriptions.values()) subscription.unsubscribe();
    this.deviceSubscriptions.clear();
    this.rawInput.complete();
    this.clear();
    this.dsm.dispose();
    this.browserActivity.release();
    this.controllers.clear();
    this.controllersSubject.next([]);
    this.controllersSubject.complete();
    this.enabledSubject.complete();
    this.requestedEnabledSubject.complete();
    this.viewportActiveSubject.complete();
    this.requestedContextSubject.complete();
  }

  private createEvaluator(): ActionEvaluator {
    return new ActionEvaluator({
      gameplay: compileRules(actions.gameplay, this.profile.contexts.gameplay),
      ui: compileRules(actions.ui, this.profile.contexts.ui),
    });
  }

  private browserActive(): boolean {
    return !this.disposed && this.browserActivity.hasFocus && this.browserActivity.isVisible;
  }

  private refreshContext(): void {
    const requested = this.requestedContextSubject.value;
    const target =
      !this.browserActive() || this.isCapturing
        ? null
        : requested === 'ui'
          ? 'ui'
          : requested === 'gameplay' &&
              this.requestedEnabledSubject.value &&
              this.viewportActiveSubject.value
            ? 'gameplay'
            : null;
    this.inputCapture.publish();
    this.inputEvaluator.setContext(target);
    if (this.enabledSubject.value !== (target === 'gameplay'))
      this.enabledSubject.next(target === 'gameplay');
  }

  private onRawPress(control: ButtonControl): void {
    if (!this.browserActive()) return;
    this.rawInput.next(control);
  }

  private trackControllerActivity(
    current: RawInput['sticks'],
    previous: RawInput['sticks'],
    pressed: boolean,
  ): void {
    if (!this.browserActive()) return;
    const bindings = Object.values(
      this.profile.contexts[this.requestedContextSubject.value ?? 'gameplay'],
    );
    const moved = (['left', 'right'] as const).some((stick) => {
      const deadzones = bindings.flatMap((choices) =>
        choices.flatMap((choice) =>
          'kind' in choice && choice.kind === 'stick2d' && choice.stick === stick
            ? [choice.deadzone]
            : [],
        ),
      );
      const deadzone = Math.min(...deadzones);
      return (
        Math.hypot(current[stick].x, current[stick].y) > deadzone &&
        Math.hypot(current[stick].x - previous[stick].x, current[stick].y - previous[stick].y) >
          0.02
      );
    });
    if (pressed || moved) this.controllerTarget = true;
  }

  private keyIsBound(code: string, context: Context): boolean {
    for (const choices of Object.values(this.profile.contexts[context])) {
      for (const choice of choices) {
        if ('device' in choice && choice.device === 'keyboard' && choice.code === code) return true;
        if (
          'kind' in choice &&
          choice.kind === 'buttons2d' &&
          [choice.up, choice.down, choice.left, choice.right].some(
            (control) => control.device === 'keyboard' && control.code === code,
          )
        )
          return true;
      }
    }
    return false;
  }

  private acceptKeyboard(input: UiKeyInput, ui: boolean): boolean {
    if (!isKeyCode(input.code) || (input.down && input.composing)) return false;
    const context = this.inputEvaluator.currentContext;
    const captured = this.isCapturing && this.browserActive();
    const allowed =
      captured ||
      (context !== null &&
        (ui ? context === 'ui' : context === 'gameplay') &&
        !input.editable &&
        this.keyIsBound(input.code, context));
    if (input.down && input.editable && !captured) return false;
    this.inputCapture.onKeyboard({
      type: input.down ? 'keydown' : 'keyup',
      code: input.code,
      repeat: input.repeat,
      preventDefault: () => undefined,
    });
    return allowed;
  }

  private acceptDeviceKeyboard(event: IKeyboardEvent): void {
    if (event.type !== 'keydown' && event.type !== 'keyup') return;
    if (event.type === 'keydown' && this.requestedContextSubject.value === null) return;
    if ('defaultPrevented' in event && event.defaultPrevented && event.type === 'keydown') return;
    const accepted = this.acceptKeyboard(
      {
        code: event.code,
        down: event.type === 'keydown',
        repeat: event.repeat,
        composing: 'isComposing' in event && Boolean(event.isComposing),
      },
      false,
    );
    if (accepted) event.preventDefault();
  }

  private connectDevice(device: DeviceSourceType): void {
    const key = device.deviceType + ':' + device.deviceSlot;
    this.deviceSubscriptions.get(key)?.unsubscribe();
    if (device.deviceType === DeviceType.Keyboard) {
      this.deviceSubscriptions.set(
        key,
        fromBabylonObservable(device.onInputChangedObservable).subscribe((event) =>
          this.acceptDeviceKeyboard(event),
        ),
      );
    } else if (device.deviceType === DeviceType.Mouse) {
      const subscription = fromBabylonObservable(device.onInputChangedObservable).subscribe(
        (event) => {
          this.markPointerActivity();
          if (
            event.type === 'pointerup' ||
            this.inputEvaluator.currentContext === 'gameplay' ||
            (this.isCapturing && this.browserActive())
          )
            this.inputCapture.onMouse(event);
        },
      );
      this.deviceSubscriptions.set(key, subscription);
    }
    const type = controllerTypes[device.deviceType];
    if (type) {
      const id = type + ':' + device.deviceSlot;
      this.controllers.set(id, device);
      if (this.selectedId === undefined) this.selectController(null);
      else this.publishControllers();
    }
  }

  private disconnectDevice(device: DeviceSourceType): void {
    const key = device.deviceType + ':' + device.deviceSlot;
    this.deviceSubscriptions.get(key)?.unsubscribe();
    this.deviceSubscriptions.delete(key);
    if (device.deviceType === DeviceType.Keyboard) this.inputCapture.clearDevice('keyboard');
    if (device.deviceType === DeviceType.Mouse) this.inputCapture.clearDevice('mouse');
    const type = controllerTypes[device.deviceType];
    if (type) {
      const id = type + ':' + device.deviceSlot;
      this.controllers.delete(id);
      if (this.selectedId === id) {
        this.selectController(null);
      }
      this.publishControllers();
    }
  }

  private pollController(): void {
    const device = this.selectedId ? this.controllers.get(this.selectedId) : undefined;
    if (!device) return;
    if (device.deviceType === DeviceType.Xbox) this.inputCapture.pollXbox(device.deviceSlot);
    else if (
      device.deviceType === DeviceType.DualShock ||
      device.deviceType === DeviceType.DualSense
    )
      this.inputCapture.pollController(device.deviceType, device.deviceSlot);
  }

  private publishControllers(): void {
    this.controllersSubject.next(
      [...this.controllers.entries()].map(([id, device]) => ({
        id,
        type: controllerTypes[device.deviceType]!,
        slot: device.deviceSlot,
        name: `${DeviceType[device.deviceType]} controller ${device.deviceSlot + 1}`,
        selected: id === this.selectedId,
      })),
    );
  }
}
