import type { ExperimentInput } from './browser-probe.ts';

/** Playwright init script: observes before application listeners; no polling/scheduling is added. */
export function installInputProbe(options: { syntheticGamepad: boolean }): void {
  const nativeGetGamepads = navigator.getGamepads.bind(navigator);
  let axes = [0, 0, 0, 0],
    connected = true,
    previous = '';
  const pressed = new Set<string>();
  const buttonValues = Array<number>(18).fill(0);
  const gamepad = (): Gamepad =>
    ({
      id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      index: 0,
      connected,
      mapping: 'standard',
      timestamp: performance.now(),
      axes: [...axes],
      buttons: buttonValues.map(value => ({ pressed: value > .5, touched: value > 0, value })),
      vibrationActuator: null,
    }) as unknown as Gamepad;
  const api: ExperimentInput = {
    probeId: undefined,
    syntheticGamepad: options.syntheticGamepad,
    arm(id, operation, device) {
      api.probeId = id;
      globalThis.__scrapworksPhysicsProbe?.mark('probe-armed', { id, operation, device });
    },
    setGamepad(x, y, nextConnected = true) {
      if (![x, y].every((value) => Number.isFinite(value) && Math.abs(value) <= 1))
        throw new Error('Invalid synthetic gamepad axes');
      axes = [x, y, 0, 0];
      const changed = connected !== nextConnected;
      connected = nextConnected;
      if (changed) {
        const event = new Event(connected ? 'gamepadconnected' : 'gamepaddisconnected');
        Object.defineProperty(event, 'gamepad', { value: gamepad() });
        window.dispatchEvent(event);
      }
    },
  };
  Object.defineProperty(api, 'setButton', { value: (index: number, value: number) => { if (!Number.isInteger(index) || index < 0 || index >= buttonValues.length || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid synthetic button'); buttonValues[index] = value; } });
  globalThis.__scrapworksExperimentInput = api;
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => {
      const pads = options.syntheticGamepad ? [connected ? gamepad() : null] : nativeGetGamepads();
      const samples = Array.from(pads, (pad) =>
        pad
          ? {
              index: pad.index,
              id: pad.id,
              mapping: pad.mapping,
              connected: pad.connected,
              axes: [...pad.axes],
              buttons: pad.buttons.map((button) => button.value),
            }
          : null,
      );
      const signature = JSON.stringify(samples);
      if (signature !== previous) {
        previous = signature;
        globalThis.__scrapworksPhysicsProbe?.mark('raw-gamepad', {
          samples,
          synthetic: options.syntheticGamepad,
        });
      }
      return pads;
    },
  });
  // Native capture is an isolated pre-application diagnostic, not an application lifecycle listener.
  // The browser context owns teardown. RxJS is not loaded before the application bootstrap.
  for (const type of ['keydown', 'keyup'] as const)
    window.addEventListener(
      type,
      (event) => {
        const down = type === 'keydown';
        const changed = down !== pressed.has(event.code);
        if (down) pressed.add(event.code);
        else pressed.delete(event.code);
        globalThis.__scrapworksPhysicsProbe?.mark(
          changed ? 'raw-keyboard' : 'raw-keyboard-repeat',
          { code: event.code, down, repeat: event.repeat, trusted: event.isTrusted },
        );
      },
      { capture: true },
    );
  for (const type of ['focus', 'blur']) window.addEventListener(type, () => globalThis.__scrapworksPhysicsProbe?.mark('window-' + type, { hidden: document.hidden, focused: document.hasFocus() }));
  document.addEventListener('visibilitychange', () => globalThis.__scrapworksPhysicsProbe?.mark('visibility', { hidden: document.hidden, focused: document.hasFocus() }));
}
