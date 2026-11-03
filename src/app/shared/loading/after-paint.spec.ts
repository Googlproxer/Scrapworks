import { TestBed } from '@angular/core/testing';
import { AFTER_PAINT } from './after-paint';
import { LoadingIndicatorComponent } from './loading-indicator/loading-indicator.component';

describe('after paint scheduling', () => {
  it('waits for an Angular render and two animation frames, and cancels pending work', () => {
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
    vi.restoreAllMocks();
  });
});
