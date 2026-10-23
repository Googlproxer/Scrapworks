import { inject, InjectionToken, Service } from '@angular/core';
import { isKeyCode } from '@contracts/input';
import type {
  ButtonControl,
  Context,
  ControllerType,
  MouseButton,
  PadButton,
  Vector2Binding,
} from '@contracts/input';
import {
  createControlLabelTranslator,
  isControlLabelMessageId,
  type ControlLabelTranslator,
} from './binding-label-messages';

/** Provide at application bootstrap without changing saved binding IDs:
 * { provide: CONTROL_LABEL_TRANSLATOR,
 *   useValue: createControlLabelTranslator({ 'key.Space': 'Espace' }) }
 * For a narrower injector, also provide BindingLabels in that scope.
 * A translator may read a locale signal to update computed/template consumers.
 */
export const CONTROL_LABEL_TRANSLATOR = new InjectionToken<ControlLabelTranslator>(
  'controls.labelTranslator',
  { providedIn: 'root', factory: () => createControlLabelTranslator() },
);

export type BindingDirection = 'up' | 'down' | 'left' | 'right';

@Service()
export class BindingLabels {
  private readonly translate = inject(CONTROL_LABEL_TRANSLATOR);

  public keyboard(code: string): string {
    if (!isKeyCode(code)) return this.translate('key.unknown', { code });
    if (/^Key[A-Z]$/.test(code)) return this.translate('key.letter', { letter: code.slice(3) });
    if (/^Digit[0-9]$/.test(code)) return this.translate('key.digit', { digit: code.slice(5) });
    if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code))
      return this.translate('key.function', { number: code.slice(1) });
    if (/^Numpad[0-9]$/.test(code))
      return this.translate('key.numpadDigit', { digit: code.slice(6) });
    const message = `key.${code}`;
    return isControlLabelMessageId(message)
      ? this.translate(message)
      : this.translate('key.unknown', { code });
  }

  public mouse(button: MouseButton): string {
    const message = `mouse.${button}`;
    return isControlLabelMessageId(message)
      ? this.translate(message)
      : this.translate('control.unknown', { control: button });
  }

  public gamepad(button: PadButton, controllerType: ControllerType = 'xbox'): string {
    const shared = `pad.${button}`;
    if (isControlLabelMessageId(shared)) return this.translate(shared);
    const family =
      controllerType === 'xbox' || button === 'select' ? controllerType : 'playstation';
    const message = `pad.${family}.${button}`;
    return isControlLabelMessageId(message)
      ? this.translate(message)
      : this.translate('control.unknown', { control: button });
  }

  public button(control: ButtonControl, controllerType: ControllerType = 'xbox'): string {
    switch (control.device) {
      case 'keyboard':
        return this.keyboard(control.code);
      case 'mouse':
        return this.mouse(control.button);
      case 'gamepad':
        return this.gamepad(control.button, controllerType);
    }
  }

  public stick(stick: 'left' | 'right'): string {
    return this.translate(`stick.${stick}`);
  }

  public direction(direction: BindingDirection): string {
    return this.translate(`direction.${direction}`);
  }

  public context(context: Context): string {
    return this.translate(`context.${context}`);
  }

  public action(name: string): string {
    const message = `action.${name}`;
    return isControlLabelMessageId(message)
      ? this.translate(message)
      : this.translate('action.unknown', {
          action: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
        });
  }

  public binding(
    binding: ButtonControl | Vector2Binding,
    controllerType: ControllerType = 'xbox',
  ): string {
    if ('device' in binding) return this.button(binding, controllerType);
    if (binding.kind === 'stick2d') return this.stick(binding.stick);
    return this.directions({
      up: this.button(binding.up, controllerType),
      down: this.button(binding.down, controllerType),
      left: this.button(binding.left, controllerType),
      right: this.button(binding.right, controllerType),
    });
  }

  public directions(values: Readonly<Record<BindingDirection, string>>): string {
    return this.translate('binding.directions', values);
  }
}
