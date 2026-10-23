import { BehaviorSubject, fromEvent, Subscription } from 'rxjs';

class ActivitySource {
  public readonly visible = new BehaviorSubject(false);
  public readonly focused = new BehaviorSubject(false);
  public owners = 0;
  private readonly subscriptions = new Subscription();

  constructor(public readonly document: Document) {
    const updateVisibility = () => this.visible.next(!document.hidden);
    const updateFocus = () => this.focused.next(document.hasFocus());
    this.subscriptions.add(fromEvent(document, 'visibilitychange').subscribe(updateVisibility));
    if (document.defaultView) {
      this.subscriptions.add(fromEvent(document.defaultView, 'focus').subscribe(updateFocus));
      this.subscriptions.add(fromEvent(document.defaultView, 'blur').subscribe(updateFocus));
    }
    updateVisibility();
    updateFocus();
  }

  public dispose(): void {
    this.subscriptions.unsubscribe();
    this.visible.complete();
    this.focused.complete();
  }
}

/** One shared listener set per document, released when its final owner leaves. */
export class BrowserActivity {
  private static readonly sources = new WeakMap<Document, ActivitySource>();
  private readonly source: ActivitySource;
  private released = false;
  public readonly visibleObs;
  public readonly hasFocusObs;

  constructor(ownerDocument: Document = document) {
    let source = BrowserActivity.sources.get(ownerDocument);
    if (!source) {
      source = new ActivitySource(ownerDocument);
      BrowserActivity.sources.set(ownerDocument, source);
    }
    ++source.owners;
    this.source = source;
    this.visibleObs = source.visible.asObservable();
    this.hasFocusObs = source.focused.asObservable();
  }

  public get isVisible(): boolean {
    return this.source.visible.value;
  }
  public get hasFocus(): boolean {
    return this.source.focused.value;
  }
  public get activeElement(): Element | null {
    return this.source.document.activeElement;
  }

  public release(): void {
    if (this.released) return;
    this.released = true;
    if (--this.source.owners === 0) {
      this.source.dispose();
      BrowserActivity.sources.delete(this.source.document);
    }
  }

  public dispose(): void {
    this.release();
  }
}
