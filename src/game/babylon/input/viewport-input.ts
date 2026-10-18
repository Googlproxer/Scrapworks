import { BehaviorSubject, combineLatest, filter, fromEvent, map, Subscription } from 'rxjs';
import { BrowserActivity } from '../lifecycle/browser-activity';
import { initKeyMap, isKeyMapKey, KeyMap, ReadonlyKeyMap } from './key-map';

/**
 * Handles all keyboard input
 */
export class ViewportInput {
  private readonly enabledSubject = new BehaviorSubject(true);
  private readonly stateSubject = new BehaviorSubject<KeyMap>(initKeyMap());

  private readonly subs: Subscription[] = [];

  /**
   * Read the full key map as a readonly map of all current key states
   */
  public readonly stateObs = this.stateSubject.pipe(map((keyMap) => keyMap as ReadonlyKeyMap));
  public readonly enabledObs = this.enabledSubject.asObservable();

  public get enabled() {
    return this.enabledSubject.value;
  }

  private readonly browserActivity = new BrowserActivity();

  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    //  listen for keydown on canvas, and keyup on window
    //  prevents unfocused input from being captured
    this.subs.push(
      fromEvent<KeyboardEvent>(canvas, 'keydown').subscribe(this.onKeyDown.bind(this)),
      fromEvent<KeyboardEvent>(window, 'keyup').subscribe(this.onKeyUp.bind(this)),

      combineLatest([this.browserActivity.hasFocusObs, this.browserActivity.visibleObs])
        //  Either is false, clear state
        .pipe(filter((i) => !i[0] || !i[1]))
        .subscribe(() => this.clear()),

      fromEvent(canvas, 'blur').subscribe(() => this.clear()),
    );
  }

  /**
   * Sets the output of keyboard events
   *
   * @param on Toggle the enabled state
   */
  public setEnabled(on: boolean) {
    this.enabledSubject.next(on);
    if (!on) this.clear();
  }

  /**
   * Clear current state, all keys will be treated as up even if still down
   */
  public clear() {
    this.stateSubject.next(initKeyMap());
  }

  /**
   *
   */
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const sub of this.subs) {
      sub.unsubscribe();
    }

    this.clear();

    this.stateSubject.complete();
    this.enabledSubject.complete();
  }

  private onKeyDown(event: KeyboardEvent) {
    this.handleKeyEvent(event, true);
  }

  private onKeyUp(event: KeyboardEvent) {
    this.handleKeyEvent(event, false);
  }

  private handleKeyEvent(event: KeyboardEvent, down: boolean) {
    //  don't handle key down if default is prevented
    if (event.defaultPrevented && down) return;
    //  don't handle if not enabled
    if (!this.enabledSubject.value && down) return;
    //  ignore repeat events
    if (event.repeat) return;

    const code = event.code;
    if (!isKeyMapKey(code)) return;

    const current = { ...this.stateSubject.value };
    current[code] = down;

    this.stateSubject.next(current);
  }
}
