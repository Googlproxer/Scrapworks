import { DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ActionFrame, ActionState } from '@contracts/input';
import { GameRuntimeService } from '../game/game-runtime.service';
import { SaveLoadComponent } from '../save/save-load/save-load.component';
import { SaveService } from '../save/save.service';
import { UiInputAdapterService } from './ui-input-adapter.service';
import { UiService } from './ui.service';

describe('UiInputAdapterService', () => {
  let adapter: UiInputAdapterService;
  let page: HTMLDivElement;
  let overlay: HTMLDivElement;
  let dispatch: (frame: ActionFrame) => void;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let runtime: {
    subscribeActions: ReturnType<typeof vi.fn>;
    capturingBinding: ReturnType<typeof signal<boolean>>;
    inspectorActive: ReturnType<typeof signal<boolean>>;
    handleUiKeyboard: ReturnType<typeof vi.fn>;
    handleUiPointer: ReturnType<typeof vi.fn>;
    setUiFocused: ReturnType<typeof vi.fn>;
    currentSceneKey: ReturnType<typeof vi.fn>;
    focusViewport: ReturnType<typeof vi.fn>;
  };
  let ui: {
    activeElement: HTMLElement | null;
    openUIDialog: ReturnType<typeof vi.fn>;
    closeTopDialog: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    page = document.createElement('div');
    page.innerHTML =
      '<canvas tabindex="0"></canvas><button>First</button><button>Second</button><button disabled>Unavailable</button><input type="text" aria-label="Name">';
    overlay = document.createElement('div');
    overlay.innerHTML =
      '<button>Dialog first</button><button>Dialog second</button><select aria-label="Choice"><option>One</option><option>Two</option></select><input type="range" min="0" max="10" step="1" value="5" aria-label="Level"><textarea aria-label="Notes"></textarea>';
    overlay.style.cssText =
      'display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:1000px';
    document.body.append(page, overlay);
    unsubscribe = vi.fn();
    runtime = {
      subscribeActions: vi.fn((listener: (frame: ActionFrame) => void) => {
        dispatch = listener;
        return unsubscribe;
      }),
      capturingBinding: signal(false),
      inspectorActive: signal(false),
      handleUiKeyboard: vi.fn(() => false),
      handleUiPointer: vi.fn(() => true),
      setUiFocused: vi.fn(),
      currentSceneKey: vi.fn(() => 'Game'),
      focusViewport: vi.fn(),
    };
    ui = { activeElement: null, openUIDialog: vi.fn(), closeTopDialog: vi.fn(() => false) };
    await TestBed.configureTestingModule({
      imports: [SaveLoadComponent],
      providers: [
        UiInputAdapterService,
        { provide: GameRuntimeService, useValue: runtime },
        { provide: UiService, useValue: ui },
        { provide: SaveService, useValue: {} },
        { provide: DialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
    adapter = TestBed.inject(UiInputAdapterService);
    adapter.attach(page);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    page.remove();
    overlay.remove();
    vi.restoreAllMocks();
  });

  function frame(states: Record<string, ActionState>, context: ActionFrame['context'] = 'ui') {
    dispatch({ context, revision: 1, states });
  }
  function press(name: string, context: ActionFrame['context'] = 'ui') {
    frame({ [name]: { kind: 'button', held: true, pressed: true, released: false } }, context);
  }
  function navigate(x: number, y: number) {
    frame({ navigate: { kind: 'vector2', value: { x, y } } });
  }

  it('leaves Inspector keyboard events and focus native without opening app menus or raw capture', () => {
    runtime.inspectorActive.set(true);
    runtime.capturingBinding.set(true);
    runtime.handleUiKeyboard.mockReturnValue(true);
    const button = page.querySelector('button')!;
    const canvas = page.querySelector('canvas')!;
    const editor = overlay.querySelector('textarea')!;
    for (const target of [button, canvas, editor]) {
      target.focus();
      for (const code of ['Escape', 'ArrowLeft', 'ArrowDown', 'Enter', 'Tab', 'KeyA']) {
        const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(target);
      }
    }
    expect(runtime.handleUiKeyboard).not.toHaveBeenCalled();
    expect(runtime.setUiFocused).not.toHaveBeenCalled();
    expect(ui.openUIDialog).not.toHaveBeenCalled();
  });

  it('forwards Inspector key releases outside app scope even when native widgets handled them', () => {
    runtime.inspectorActive.set(true);
    runtime.handleUiKeyboard.mockReturnValue(true);
    const outside = overlay.querySelector('textarea')!;
    const release = new KeyboardEvent('keyup', {
      code: 'KeyW',
      bubbles: true,
      cancelable: true,
    });
    outside.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(false);
    const handled = new KeyboardEvent('keyup', {
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    outside.dispatchEvent(handled);
    expect(runtime.handleUiKeyboard.mock.calls).toEqual([
      [{ code: 'KeyW', down: false }],
      [{ code: 'Enter', down: false }],
    ]);
  });

  it('ignores UI/gameplay actions while Inspector is active and resumes app navigation afterward', () => {
    ui.activeElement = overlay;
    const [first, second] = overlay.querySelectorAll('button');
    const activate = vi.fn();
    first.addEventListener('click', activate);
    first.focus();
    runtime.inspectorActive.set(true);
    press('menu', 'gameplay');
    press('cancel');
    press('submit');
    navigate(0, -1);
    adapter.openMenu();
    expect(document.activeElement).toBe(first);
    expect(activate).not.toHaveBeenCalled();
    expect(ui.openUIDialog).not.toHaveBeenCalled();
    expect(ui.closeTopDialog).not.toHaveBeenCalled();
    expect(runtime.focusViewport).not.toHaveBeenCalled();
    runtime.inspectorActive.set(false);
    navigate(0, -1);
    expect(document.activeElement).toBe(second);
  });

  it('keeps Inspector pointer clicks native while releasing a capture started before it opened', () => {
    ui.activeElement = overlay;
    runtime.capturingBinding.set(true);
    const target = overlay.querySelector('button')!;
    target.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true }),
    );
    runtime.inspectorActive.set(true);
    target.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 7, bubbles: true }));
    const activate = vi.fn();
    target.addEventListener('click', activate);
    const click = new MouseEvent('click', {
      button: 0,
      detail: 1,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(click);
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 8,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(down);
    expect(click.defaultPrevented).toBe(false);
    expect(down.defaultPrevented).toBe(false);
    expect(activate).toHaveBeenCalledOnce();
    expect(runtime.handleUiPointer.mock.calls).toEqual([
      [{ button: 0, down: true }],
      [{ button: 0, down: false }],
    ]);
  });

  it('moves controller focus within the active dialog, skips disabled controls and repeats at a bounded rate', () => {
    ui.activeElement = overlay;
    const [first, second] = overlay.querySelectorAll('button');
    first.focus();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    navigate(0, -1);
    expect(document.activeElement).toBe(second);
    navigate(0, -1);
    expect(document.activeElement).toBe(second);
    now = 400;
    navigate(0, -1);
    expect(document.activeElement).toBe(overlay.querySelector('select'));
    navigate(0, 0);
    navigate(0, 1);
    expect(document.activeElement).toBe(second);
  });

  it('moves through the rendered Save/Load table by column and row instead of DOM order', async () => {
    const fixture = TestBed.createComponent(SaveLoadComponent);
    await fixture.whenStable();
    overlay.replaceChildren(fixture.nativeElement as HTMLElement);
    ui.activeElement = overlay;
    const rows = [...overlay.querySelectorAll('tbody tr')].map((row) => [
      ...row.querySelectorAll<HTMLButtonElement>('button'),
    ]);
    const move = (x: number, y: number) => {
      navigate(0, 0);
      navigate(x, y);
    };
    rows[0][0].focus();
    move(0, -1);
    expect(document.activeElement).toBe(rows[1][0]);
    move(1, 0);
    expect(document.activeElement).toBe(rows[1][1]);
    move(0, -1);
    expect(document.activeElement).toBe(rows[2][1]);
    move(0, 1);
    expect(document.activeElement).toBe(rows[1][1]);
    move(-1, 0);
    expect(document.activeElement).toBe(rows[1][0]);
    move(-1, 0);
    expect(document.activeElement).toBe(rows[1][0]);
    fixture.destroy();
  });

  it('uses live layout when controls reflow and never wraps to the opposite edge', () => {
    ui.activeElement = overlay;
    overlay.innerHTML = '<button>First</button><button>Second</button><button>Third</button>';
    const [first, second, third] = overlay.querySelectorAll('button');
    first.focus();
    navigate(0, -1);
    expect(document.activeElement).toBe(second);
    overlay.style.flexDirection = 'row';
    first.focus();
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(first);
    navigate(1, 0);
    expect(document.activeElement).toBe(second);
    third.focus();
    navigate(0, 0);
    navigate(1, 0);
    expect(document.activeElement).toBe(third);
  });

  it('starts controller menu navigation at a UI control instead of the overlapping game canvas', () => {
    const canvas = page.querySelector('canvas')!;
    canvas.focus();
    navigate(0, -1);
    expect(document.activeElement).toBe(page.querySelector('button'));
  });

  it('enters table controls directly instead of landing on their focusable scroll wrapper', () => {
    ui.activeElement = overlay;
    overlay.innerHTML = `
      <button>Device tab</button>
      <div role="region" aria-label="Bindings" tabindex="0" style="overflow:auto">
        <table><tbody>
          <tr><td><button>First primary</button></td><td><button>First alternative</button></td></tr>
          <tr><td><button>Second primary</button></td><td><button>Second alternative</button></td></tr>
        </tbody></table>
      </div>
      <button>Save controls</button>`;
    const [tab, first, , second, , save] = overlay.querySelectorAll('button');
    tab.focus();
    navigate(0, -1);
    expect(document.activeElement).toBe(first);
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(second);
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(save);
    navigate(0, 1);
    expect(document.activeElement).toBe(second);
    expect(overlay.querySelector<HTMLElement>('[role="region"]')!.tabIndex).toBe(0);
  });

  it('keeps scrolling through child rows before leaving a clipped table for its footer', () => {
    ui.activeElement = overlay;
    overlay.innerHTML = `
      <div role="region" aria-label="Bindings" tabindex="0" style="width:240px;height:55px;overflow:auto">
        <table style="border-collapse:collapse"><tbody>
          <tr><td><button style="height:36px">First row</button></td></tr>
          <tr><td><button style="height:36px">Second row</button></td></tr>
          <tr><td><button style="height:36px">Third row</button></td></tr>
        </tbody></table>
      </div><button>Save controls</button>`;
    const [first, second, third, save] = overlay.querySelectorAll('button');
    const region = overlay.querySelector<HTMLElement>('[role="region"]')!;
    first.focus();
    navigate(0, -1);
    expect(document.activeElement).toBe(second);
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(third);
    expect(region.scrollTop).toBeGreaterThan(0);
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(save);
  });

  it('preserves native arrows on a Tab-focused scroll box and lets controller navigation enter its visible children', () => {
    ui.activeElement = overlay;
    overlay.innerHTML = `
      <div role="region" aria-label="Bindings" tabindex="0" style="width:140px;overflow:auto">
        <table style="width:320px"><tbody><tr>
          <td><button>First binding</button></td><td><button>Second binding</button></td>
        </tr></tbody></table>
      </div>`;
    const region = overlay.querySelector<HTMLElement>('[role="region"]')!;
    region.focus();
    const right = new KeyboardEvent('keydown', {
      code: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    region.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false);
    expect(runtime.handleUiKeyboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ editable: true }),
    );
    navigate(0, -1);
    expect(document.activeElement).toBe(region.querySelector('button'));
  });

  it('skips disabled, hidden, inert and non-tab-stop controls while preserving the visible column', () => {
    ui.activeElement = overlay;
    overlay.style.cssText =
      'display:grid;grid-template-columns:100px 100px 100px;gap:12px;width:324px';
    overlay.innerHTML = `
      <button>A</button><button>B</button><button>C</button>
      <button disabled>D</button><button style="visibility:hidden">E</button><button aria-disabled="true">F</button>
      <button>G</button><button>H</button><button>I</button>
      <button inert>J</button><button tabindex="-1">K</button><button style="opacity:0">L</button>`;
    const buttons = [...overlay.querySelectorAll('button')];
    buttons[0].focus();
    navigate(0, -1);
    expect(document.activeElement).toBe(buttons[6]);
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(buttons[6]);
    buttons[1].focus();
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(buttons[7]);
    buttons[2].focus();
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(buttons[8]);
  });

  it('chooses the nearest visible position in uneven rows', () => {
    ui.activeElement = overlay;
    overlay.innerHTML = `
      <div style="display:flex;gap:12px"><button style="width:100px">A</button><button style="width:100px">B</button><button style="width:100px">C</button></div>
      <div style="display:flex;gap:12px;margin-left:60px"><button style="width:100px">D</button><button style="width:100px">E</button></div>`;
    const [first, , third, fourth, fifth] = overlay.querySelectorAll('button');
    first.focus();
    navigate(0, -1);
    expect(document.activeElement).toBe(fourth);
    third.focus();
    navigate(0, 0);
    navigate(0, -1);
    expect(document.activeElement).toBe(fifth);
    navigate(-1, 0);
    expect(document.activeElement).toBe(fourth);
  });

  it('activates controller tabs once on their orientation axis and moves spatially into their panel', () => {
    ui.activeElement = overlay;
    overlay.innerHTML = `
      <div role="tablist" style="display:flex;gap:12px">
        <button role="tab" tabindex="0">Keyboard</button><button role="tab" tabindex="-1">Controller</button><button role="tab" tabindex="-1" disabled>Unavailable</button>
      </div>
      <div role="tabpanel"><button>Panel action</button></div>`;
    const [first, second, , panel] = overlay.querySelectorAll('button');
    const activate = vi.fn();
    second.addEventListener('click', activate);
    first.focus();
    navigate(1, 0);
    expect(document.activeElement).toBe(second);
    expect(activate).toHaveBeenCalledOnce();
    navigate(0, -1);
    expect(document.activeElement).toBe(panel);
    first.focus();
    navigate(-1, 0);
    expect(document.activeElement).toBe(second);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('submits the focused button once and cancels the top dialog before returning focus to the viewport', () => {
    const button = page.querySelector('button')!;
    button.focus();
    const click = vi.fn();
    button.addEventListener('click', click);
    press('submit');
    expect(click).toHaveBeenCalledOnce();
    ui.closeTopDialog.mockReturnValueOnce(true);
    press('cancel');
    expect(runtime.focusViewport).not.toHaveBeenCalled();
    press('cancel');
    expect(runtime.focusViewport).toHaveBeenCalledOnce();
  });

  it('prevents native Enter activation when the action frame owns the one button submission', () => {
    const button = page.querySelector('button')!;
    button.focus();
    const activate = vi.fn();
    button.addEventListener('click', activate);
    runtime.handleUiKeyboard.mockReturnValue(true);
    const event = new KeyboardEvent('keydown', {
      code: 'Enter',
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    press('submit');
    expect(activate).toHaveBeenCalledOnce();
  });

  it('adjusts native select and range controls with controller left/right navigation', () => {
    ui.activeElement = overlay;
    const select = overlay.querySelector('select')!;
    const change = vi.fn();
    select.addEventListener('change', change);
    select.focus();
    navigate(1, 0);
    expect(select.selectedIndex).toBe(1);
    expect(change).toHaveBeenCalledOnce();
    navigate(0, 0);
    const range = overlay.querySelector<HTMLInputElement>('input[type="range"]')!;
    const input = vi.fn();
    range.addEventListener('input', input);
    range.focus();
    navigate(-1, 0);
    expect(range.value).toBe('4');
    expect(input).toHaveBeenCalledOnce();
  });

  it('skips unavailable select options and does not fire changes beyond a native value boundary', () => {
    ui.activeElement = overlay;
    const select = overlay.querySelector('select')!;
    select.innerHTML =
      '<option>First</option><option disabled>Disabled</option><option hidden>Hidden</option><optgroup disabled label="Unavailable"><option>Grouped</option></optgroup><option>Last</option>';
    const change = vi.fn();
    select.addEventListener('change', change);
    select.focus();
    navigate(1, 0);
    expect(select.selectedIndex).toBe(4);
    navigate(0, 0);
    navigate(1, 0);
    expect(change).toHaveBeenCalledOnce();
    const range = overlay.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = range.max;
    const input = vi.fn();
    range.addEventListener('input', input);
    range.focus();
    navigate(0, 0);
    navigate(1, 0);
    expect(input).not.toHaveBeenCalled();
  });

  it('leaves browser Tab and already-handled tab arrows native without a second activation', () => {
    ui.activeElement = overlay;
    const button = overlay.querySelector('button')!;
    runtime.handleUiKeyboard.mockReturnValue(true);
    const tab = new KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true });
    button.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(runtime.handleUiKeyboard).not.toHaveBeenCalled();
    const activate = vi.fn();
    button.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        activate();
      }
    });
    button.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(activate).toHaveBeenCalledOnce();
    expect(runtime.handleUiKeyboard).not.toHaveBeenCalled();
  });

  it('preserves native keyboard arrows in text, select, range and inherited editable content', () => {
    ui.activeElement = overlay;
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.innerHTML = '<span>Editable text</span>';
    overlay.append(editable);
    const targets = [
      page.querySelector('input')!,
      overlay.querySelector('select')!,
      overlay.querySelector('input')!,
      editable.querySelector('span')!,
    ];
    for (const target of targets) {
      const event = new KeyboardEvent('keydown', {
        code: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(runtime.handleUiKeyboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'ArrowLeft', editable: true }),
      );
    }
  });

  it('keeps native text entry and Tab behavior while forwarding editable status to input ownership', () => {
    const input = page.querySelector('input')!;
    input.focus();
    for (const code of ['KeyA', 'Enter', 'Tab']) {
      const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(runtime.handleUiKeyboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: 'Enter', editable: true, down: true }),
    );
    expect(runtime.setUiFocused).toHaveBeenLastCalledWith(true);
  });

  it('leaves a textarea untouched by controller submit', () => {
    ui.activeElement = overlay;
    const textarea = overlay.querySelector('textarea')!;
    const click = vi.fn();
    textarea.addEventListener('click', click);
    textarea.focus();
    press('submit');
    expect(click).not.toHaveBeenCalled();
  });

  it('reserves fresh Escape in the viewport as a menu exit and ignores repeated Escape', () => {
    const canvas = page.querySelector('canvas')!;
    canvas.focus();
    const event = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', repeat: true, bubbles: true }),
    );
    expect(event.defaultPrevented).toBe(true);
    expect(ui.openUIDialog).toHaveBeenCalledOnce();
    expect(runtime.handleUiKeyboard).not.toHaveBeenCalled();
  });

  it('opens the game menu from a gamepad action and suppresses UI action dispatch during binding capture', () => {
    press('menu', 'gameplay');
    expect(ui.openUIDialog).toHaveBeenCalledOnce();
    runtime.capturingBinding.set(true);
    press('cancel');
    press('submit');
    expect(ui.closeTopDialog).not.toHaveBeenCalled();
  });

  it('forwards pointer release after a synchronous binding capture finishes', () => {
    ui.activeElement = overlay;
    runtime.capturingBinding.set(true);
    runtime.handleUiPointer.mockImplementation((input) => {
      if (input.down) runtime.capturingBinding.set(false);
      return input.down;
    });
    const target = overlay.querySelector('button')!;
    const down = new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    target.dispatchEvent(down);
    target.dispatchEvent(
      new PointerEvent('pointerup', { button: 0, bubbles: true, cancelable: true }),
    );
    expect(down.defaultPrevented).toBe(true);
    expect(runtime.handleUiPointer.mock.calls).toEqual([
      [{ button: 0, down: true }],
      [{ button: 0, down: false }],
    ]);
  });

  it.each(['outside', 'close', 'closed-dialog'])(
    'releases a captured pointer over %s after capture unsubscribes',
    (destination) => {
      ui.activeElement = overlay;
      runtime.capturingBinding.set(true);
      runtime.handleUiPointer.mockImplementation((input) => {
        if (input.down) runtime.capturingBinding.set(false);
        return input.down;
      });
      const target = overlay.querySelector('button')!;
      target.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true }),
      );
      const releaseTarget = destination === 'outside' ? document.body : target;
      if (destination === 'close') target.setAttribute('data-capture-cancel', '');
      if (destination === 'closed-dialog') ui.activeElement = null;
      releaseTarget.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, pointerId: 7, bubbles: true }),
      );
      expect(runtime.handleUiPointer.mock.calls).toEqual([
        [{ button: 0, down: true }],
        [{ button: 0, down: false }],
      ]);
    },
  );

  it('releases a canceled captured pointer and ignores unrelated document pointer releases', () => {
    ui.activeElement = overlay;
    runtime.capturingBinding.set(true);
    overlay
      .querySelector('button')!
      .dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 7, bubbles: true }));
    document.body.dispatchEvent(
      new PointerEvent('pointerup', { button: 2, pointerId: 8, bubbles: true }),
    );
    expect(runtime.handleUiPointer).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(
      new PointerEvent('pointercancel', { button: -1, pointerId: 7, bubbles: true }),
    );
    expect(runtime.handleUiPointer).toHaveBeenLastCalledWith({ button: 2, down: false });
    expect(runtime.handleUiPointer).toHaveBeenCalledTimes(2);
  });

  it('consumes a captured mouse click before a binding control can reopen capture or remove its binding', () => {
    ui.activeElement = overlay;
    runtime.capturingBinding.set(true);
    runtime.handleUiPointer.mockImplementation((input) => {
      if (input.down) runtime.capturingBinding.set(false);
      return input.down;
    });
    const target = overlay.querySelector('button')!;
    const activate = vi.fn();
    target.addEventListener('click', activate);
    target.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true }),
    );
    target.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 7, bubbles: true }));
    const click = new MouseEvent('click', {
      button: 0,
      detail: 1,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    target.click();
    expect(activate).toHaveBeenCalledOnce();
  });

  it('keeps native capture-cancel buttons usable and expires suppression before another pointer press', () => {
    ui.activeElement = overlay;
    runtime.capturingBinding.set(true);
    const [target, cancel] = overlay.querySelectorAll('button');
    cancel.setAttribute('data-capture-cancel', '');
    const activate = vi.fn();
    cancel.addEventListener('click', activate);
    target.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true }),
    );
    target.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 7, bubbles: true }));
    cancel.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true }),
    );
    cancel.dispatchEvent(new MouseEvent('click', { button: 0, detail: 1, bubbles: true }));
    expect(activate).toHaveBeenCalledOnce();
    expect(runtime.handleUiPointer).toHaveBeenCalledTimes(2);
  });

  it('ignores input from outside its page/dialog and removes listeners on owner destruction', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(runtime.handleUiKeyboard).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalledOnce();
    page
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(runtime.handleUiKeyboard).not.toHaveBeenCalled();
    outside.remove();
  });
});
