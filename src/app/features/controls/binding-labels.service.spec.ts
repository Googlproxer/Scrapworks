import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  actions,
  defaultProfile,
  keyCodes,
  type ControllerType,
  type PadButton,
} from '@contracts/input';
import {
  createControlLabelTranslator,
  type ControlLabelTranslator,
} from './binding-label-messages';
import { BindingLabels, CONTROL_LABEL_TRANSLATOR } from './binding-labels.service';

describe('BindingLabels', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('formats physical keys without leaking storage names and covers every supported key', () => {
    const labels = TestBed.inject(BindingLabels);
    expect(labels.keyboard('KeyA')).toBe('A');
    expect(labels.keyboard('Digit7')).toBe('7');
    expect(labels.keyboard('Equal')).toBe('=');
    expect(labels.keyboard('Backslash')).toBe('\\');
    expect(labels.keyboard('ControlLeft')).toBe('Left Ctrl');
    expect(labels.keyboard('AltRight')).toBe('Right Alt');
    expect(labels.keyboard('ArrowUp')).toBe('Up arrow');
    expect(labels.keyboard('Numpad7')).toBe('Numpad 7');
    expect(labels.keyboard('NumpadEnter')).toBe('Numpad Enter');
    expect(labels.keyboard('F24')).toBe('F24');
    expect(labels.keyboard('AudioVolumeUp')).toBe('Volume up');
    for (const code of keyCodes) {
      const label = labels.keyboard(code);
      expect(label, code).not.toContain('Unknown');
      expect(label, code).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it('keeps unknown physical codes identifiable without treating them as message IDs', () => {
    const labels = TestBed.inject(BindingLabels);
    expect(labels.keyboard('VendorMacro9')).toBe('Unknown key (VendorMacro9)');
    expect(labels.keyboard('letter')).toBe('Unknown key (letter)');
    expect(labels.keyboard('F25')).toBe('Unknown key (F25)');
  });

  it('uses each controller family’s face, shoulder, trigger, menu and stick-press names', () => {
    const labels = TestBed.inject(BindingLabels);
    const faces: readonly PadButton[] = ['south', 'east', 'west', 'north'];
    expect(faces.map((button) => labels.gamepad(button, 'xbox'))).toEqual(['A', 'B', 'X', 'Y']);
    for (const type of ['dualshock', 'dualsense'] as const) {
      expect(faces.map((button) => labels.gamepad(button, type))).toEqual([
        'Cross',
        'Circle',
        'Square',
        'Triangle',
      ]);
      expect(labels.gamepad('leftShoulder', type)).toBe('L1');
      expect(labels.gamepad('rightShoulder', type)).toBe('R1');
      expect(labels.gamepad('leftTrigger', type)).toBe('L2');
      expect(labels.gamepad('rightTrigger', type)).toBe('R2');
      expect(labels.gamepad('leftStick', type)).toBe('L3 (left stick press)');
      expect(labels.gamepad('rightStick', type)).toBe('R3 (right stick press)');
      expect(labels.gamepad('start', type)).toBe('Options');
    }
    expect(labels.gamepad('select', 'dualshock')).toBe('Share');
    expect(labels.gamepad('select', 'dualsense')).toBe('Create');
    expect(labels.gamepad('select', 'xbox')).toBe('View');
    expect(labels.gamepad('start', 'xbox')).toBe('Menu');
    expect(labels.gamepad('leftShoulder', 'xbox')).toBe('LB');
    expect(labels.gamepad('rightShoulder', 'xbox')).toBe('RB');
    expect(labels.gamepad('leftTrigger', 'xbox')).toBe('LT');
    expect(labels.gamepad('rightTrigger', 'xbox')).toBe('RT');
    expect(labels.gamepad('leftStick', 'xbox')).toBe('LS (left stick press)');
    expect(labels.gamepad('rightStick', 'xbox')).toBe('RS (right stick press)');
  });

  it('distinguishes mouse buttons, stick motion, stick press and D-pad directions', () => {
    const labels = TestBed.inject(BindingLabels);
    expect(labels.button({ device: 'mouse', button: 'primary' })).toBe('Primary mouse button');
    expect(labels.mouse('middle')).toBe('Middle mouse button');
    expect(labels.mouse('secondary')).toBe('Secondary mouse button');
    expect(labels.mouse('back')).toBe('Mouse back button');
    expect(labels.mouse('forward')).toBe('Mouse forward button');
    expect(labels.stick('left')).toBe('Left stick');
    expect(labels.stick('right')).toBe('Right stick');
    for (const type of ['xbox', 'dualshock', 'dualsense'] satisfies ControllerType[]) {
      expect(labels.gamepad('dpadUp', type)).toBe('D-pad up');
      expect(labels.gamepad('dpadDown', type)).toBe('D-pad down');
      expect(labels.gamepad('dpadLeft', type)).toBe('D-pad left');
      expect(labels.gamepad('dpadRight', type)).toBe('D-pad right');
    }
  });

  it('formats compact vector rows and action names without modifying the stored profile', () => {
    const labels = TestBed.inject(BindingLabels);
    const original = JSON.stringify(defaultProfile);
    expect(labels.binding(defaultProfile.contexts.gameplay.move[0])).toBe('W / S / A / D');
    expect(labels.binding(defaultProfile.contexts.gameplay.move[1])).toBe('Left stick');
    expect(labels.binding(defaultProfile.contexts.gameplay.confirm[1], 'dualsense')).toBe('Cross');
    expect(labels.action('orbit')).toBe('Orbit camera');
    expect(labels.action('zoomOut')).toBe('Zoom out');
    expect(labels.context('ui')).toBe('Menus');
    for (const context of Object.values(actions))
      for (const name of Object.keys(context)) expect(labels.action(name)).not.toMatch(/\{/);
    expect(JSON.stringify(defaultProfile)).toBe(original);
  });

  it('accepts injected translated messages, parameter reordering and live locale changes', () => {
    const locale = signal<'en' | 'fr'>('en');
    const english = createControlLabelTranslator();
    const french = createControlLabelTranslator({
      'key.letter': 'Touche {letter}',
      'key.numpadDigit': '{digit} du pavé numérique',
      'key.unknown': 'Touche inconnue ({code})',
      'pad.playstation.south': 'Croix',
      'direction.up': 'Haut',
      'binding.directions': '{left}, {right}, {up}, {down}',
    });
    const translate: ControlLabelTranslator = (message, parameters) =>
      (locale() === 'fr' ? french : english)(message, parameters);
    TestBed.configureTestingModule({
      providers: [{ provide: CONTROL_LABEL_TRANSLATOR, useValue: translate }],
    });
    const labels = TestBed.inject(BindingLabels);
    const row = computed(() => labels.binding(defaultProfile.contexts.gameplay.move[0]));
    expect(row()).toBe('W / S / A / D');
    locale.set('fr');
    expect(row()).toBe('Touche A, Touche D, Touche W, Touche S');
    expect(labels.gamepad('south', 'dualsense')).toBe('Croix');
    expect(labels.keyboard('Numpad7')).toBe('7 du pavé numérique');
    expect(labels.keyboard('FutureKey')).toBe('Touche inconnue (FutureKey)');
    expect(labels.direction('up')).toBe('Haut');
    expect(labels.keyboard('Enter')).toBe('Enter');
  });
});
