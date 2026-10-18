import { BehaviorSubject, fromEvent, Subscription } from 'rxjs';

/**
 * Source for all browser state and events
 *
 * Outputs events via RxJS for easy reactive handling.
 *
 * Should be singleton, and accessible in both Angular and Babylon contexts.
 */
export class BrowserActivity {
  private readonly visibleSubject = new BehaviorSubject(false);
  private readonly hasFocusSubject = new BehaviorSubject(false);
  public readonly visibleObs = this.visibleSubject.asObservable();
  public readonly hasFocusObs = this.hasFocusSubject.asObservable();

  public get isVisible() {
    return this.visibleSubject.value;
  }

  public get hasFocus() {
    return this.hasFocusSubject.value;
  }

  public get activeElement() {
    return document.activeElement;
  }

  public static Instance: BrowserActivity;

  private subs: Subscription[] = [];

  constructor() {
    if (BrowserActivity.Instance) {
      return BrowserActivity.Instance;
    }

    BrowserActivity.Instance = this;

    this.subs.push(
      fromEvent(document, 'visibilitychange').subscribe(this.onVisibilityChange.bind(this)),
      fromEvent(window, 'focus').subscribe(this.onFocusChange.bind(this)),
      fromEvent(window, 'blur').subscribe(this.onFocusChange.bind(this)),
    );

    const unload = () => {
      for (const sub of this.subs) {
        sub.unsubscribe();
      }
      window.removeEventListener('beforeunload', unload);
    };

    window.addEventListener('beforeunload', unload);

    this.onVisibilityChange();
    this.onFocusChange();
  }

  /**
   * Update document visibility
   */
  private onVisibilityChange() {
    this.visibleSubject.next(!document.hidden);
  }

  private onFocusChange() {
    this.hasFocusSubject.next(document.hasFocus());
  }
}
