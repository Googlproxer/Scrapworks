import { DeviceSourceManager, DeviceType, Engine, EventState } from '@babylonjs/core';
import { DeviceSourceType } from '@babylonjs/core/DeviceInput/internalDeviceSourceManager.pure';
import { BehaviorSubject, combineLatest, fromEventPattern, Subscription } from 'rxjs';
import { BrowserActivity } from '../lifecycle/browser-activity';
import { actions, BindingProfile, defaultProfile } from './bindings';
import { InputCapture } from './capture';
import { ActionEvaluator } from './evaluator/evaluator';
import { compileRules } from './evaluator/evaluator.helpers';
import { Context } from './evaluator/evaluator.types';

/**
 * Handles all input
 */
export class InputManager {
  private readonly requestedEnabledSubject = new BehaviorSubject(true);
  private readonly viewportActiveSubject = new BehaviorSubject(false);
  private readonly requestedContextSubject = new BehaviorSubject<Context>('gameplay');
  private readonly enabledSubject = new BehaviorSubject(true);

  private readonly subs: Subscription[] = [];

  public readonly enabledObs = this.enabledSubject.asObservable();

  public get enabled() {
    return this.enabledSubject.value;
  }

  private readonly browserActivity = new BrowserActivity();

  private inputEvaluator = new ActionEvaluator({
    gameplay: compileRules(actions.gameplay, defaultProfile.contexts.gameplay),
    ui: compileRules(actions.ui, defaultProfile.contexts.ui),
  });
  private readonly inputCapture: InputCapture;
  private readonly dsm: DeviceSourceManager;

  //  TODO: add ability for user to choose connected device
  private activeDevice?: DeviceSourceType;

  private disposed = false;

  /**
   * @param engine The babylon engine
   */
  constructor(engine: Engine) {
    this.dsm = new DeviceSourceManager(engine);
    this.inputCapture = new InputCapture(this.dsm, this.inputEvaluator);

    this.subs.push(
      combineLatest({
        requestedContext: this.requestedContextSubject,
        gameplayAllowed: this.requestedEnabledSubject,
        viewportActive: this.viewportActiveSubject,
        hasFocus: this.browserActivity.hasFocusObs,
        visible: this.browserActivity.visibleObs,
      }).subscribe(({ requestedContext, gameplayAllowed, viewportActive, hasFocus, visible }) => {
        const target: Context | null =
          this.disposed || !hasFocus || !visible
            ? null
            : requestedContext === 'ui'
              ? 'ui'
              : gameplayAllowed && viewportActive
                ? 'gameplay'
                : null;

        if (target !== this.inputEvaluator.currentContext) {
          this.inputCapture.publish();
          this.inputEvaluator.setContext(target);
        }

        this.enabledSubject.next(target === 'gameplay');
      }),

      fromEventPattern<[DeviceSourceType, EventState]>(
        (handler) => this.dsm.onDeviceConnectedObservable.add(handler),
        (_, token) => this.dsm.onDeviceConnectedObservable.remove(token),
      ).subscribe(([device]) => {
        console.log('Device Connected', device);
        this.activeDevice = device;
        //  TODO: handle device types
        switch (device.deviceType) {
          case DeviceType.Keyboard:
            break;
        }
      }),

      fromEventPattern<[DeviceSourceType, EventState]>(
        (handler) => this.dsm.onDeviceDisconnectedObservable.add(handler),
        (_, token) => this.dsm.onDeviceDisconnectedObservable.remove(token),
      ).subscribe(([device]) => {
        console.log('Device Disconnected', device);
        if (this.activeDevice === device) this.activeDevice = undefined;
      }),
    );
  }

  /**
   * Sets requested keyboard permission; browser inactivity still blocks input.
   *
   * @param on Toggle the enabled state
   */
  public setEnabled(on: boolean) {
    this.requestedEnabledSubject.next(on);
  }

  public setContext(context: Context): void {
    this.requestedContextSubject.next(context);
  }

  /**
   * Sets the viewport active
   * @param active Toggle the active state
   */
  public setViewportActive(active: boolean): void {
    this.viewportActiveSubject.next(active);
  }

  public takeFrame() {
    if (typeof this.activeDevice?.deviceSlot === 'number')
      this.inputCapture.pollXbox(this.activeDevice.deviceSlot);

    const frame = this.inputEvaluator.takeFrame();

    if (frame.context === 'gameplay') {
      const menu = frame.states['menu'];

      if (menu?.kind === 'button' && menu.pressed) {
        this.inputEvaluator.setContext('ui');

        // Application integration:
        // cancel gameplay input, open the menu and move DOM focus.
        return;
      }

      // Deliver gameplay states.
    } else if (frame.context === 'ui') {
      // Deliver UI states to the Angular adapter.
    }
  }

  /**
   * Clear current state, all keys will be treated as up even if still down
   */
  public clear() {
    this.inputCapture.clearDevice('keyboard');
    this.inputCapture.clearDevice('mouse');
    this.inputCapture.clearDevice('gamepad');
  }

  public updateBindings(profile: BindingProfile) {
    const currentContext = this.inputEvaluator.currentContext;
    this.inputEvaluator = new ActionEvaluator({
      gameplay: compileRules(actions.gameplay, profile.contexts.gameplay),
      ui: compileRules(actions.ui, profile.contexts.ui),
    });
    this.inputEvaluator.setContext(currentContext);
    this.inputCapture.updateEvaluator(this.inputEvaluator);
  }

  /**
   *  Clear state and clean up manager
   */
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const sub of this.subs) {
      sub.unsubscribe();
    }

    this.clear();

    this.dsm.dispose();

    this.enabledSubject.complete();
    this.requestedEnabledSubject.complete();
    this.viewportActiveSubject.complete();
  }
}
