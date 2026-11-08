import { TestBed } from '@angular/core/testing';
import { AFTER_PAINT } from './after-paint';
import { LoadingIndicatorComponent } from './loading-indicator/loading-indicator.component';

describe('after paint scheduling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for an Angular render and two animation frames, and cancels pending work', () => {
    vi.spyOn(performance, 'getEntriesByName').mockReturnValue([{} as PerformanceEntry]);
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++next, callback);
      return next;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const advanceFrame = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(performance.now());
    };

    const fixture = TestBed.createComponent(LoadingIndicatorComponent);
    const schedule = TestBed.inject(AFTER_PAINT);
    const work = vi.fn();
    schedule(work);
    expect(work).not.toHaveBeenCalled();
    fixture.detectChanges();
    advanceFrame();
    expect(work).not.toHaveBeenCalled();
    advanceFrame();
    expect(work).toHaveBeenCalledOnce();
    const canceled = vi.fn();
    const cancel = schedule(canceled);
    TestBed.tick();
    advanceFrame();
    cancel();
    advanceFrame();
    expect(canceled).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('waits for first contentful paint even after both animation frames, and disconnects on cancellation', () => {
    vi.spyOn(performance, 'getEntriesByName').mockReturnValue([]);
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++next, callback);
      return next;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const advance = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(performance.now());
    };

    const observers: { notify(): void; disconnect: ReturnType<typeof vi.fn> }[] = [];

    class PaintObserver {
      public static supportedEntryTypes = ['paint'];
      public readonly disconnect = vi.fn();
      public readonly observe = vi.fn();

      constructor(callback: PerformanceObserverCallback) {
        observers.push({
          notify: () =>
            callback(
              {
                getEntries: () => [{ name: 'first-contentful-paint' }],
              } as PerformanceObserverEntryList,
              this as unknown as PerformanceObserver,
            ),
          disconnect: this.disconnect,
        });
      }
    }

    vi.stubGlobal('PerformanceObserver', PaintObserver);
    const fixture = TestBed.createComponent(LoadingIndicatorComponent);
    const schedule = TestBed.inject(AFTER_PAINT),
      work = vi.fn();
    schedule(work);
    fixture.detectChanges();
    advance();
    advance();
    expect(work).not.toHaveBeenCalled();
    observers[0].notify();
    expect(work).toHaveBeenCalledOnce();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();

    const canceled = vi.fn(),
      cancel = schedule(canceled);
    TestBed.tick();
    advance();
    advance();
    cancel();
    expect(observers[1].disconnect).toHaveBeenCalledOnce();
    observers[1].notify();
    expect(canceled).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('uses frame scheduling when paint timing is unavailable', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++next, callback);
      return next;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const advance = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(performance.now());
    };

    const fixture = TestBed.createComponent(LoadingIndicatorComponent);
    const work = vi.fn();
    TestBed.inject(AFTER_PAINT)(work);
    fixture.detectChanges();
    advance();
    expect(work).not.toHaveBeenCalled();
    advance();
    expect(work).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
