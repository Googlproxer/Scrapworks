import { FrameClock } from './frame-clock';

describe('FrameClock', () => {
  it('returns zero elapsed time for the first sample', () => {
    expect(new FrameClock().sample(42000)).toBe(0);
  });
  it('converts monotonic milliseconds to elapsed seconds', () => {
    const clock = new FrameClock();
    clock.sample(500);
    expect(clock.sample(516)).toBeCloseTo(0.016);
    expect(clock.sample(532)).toBeCloseTo(0.016);
  });
  it('excludes suspended time from the first sample after reset', () => {
    const clock = new FrameClock();
    clock.sample(500);
    clock.sample(516);
    clock.reset();
    expect(clock.sample(90000)).toBe(0);
    expect(clock.sample(90020)).toBeCloseTo(0.02);
  });
  it('does not produce negative or non-finite elapsed time', () => {
    const clock = new FrameClock();
    clock.sample(50);
    expect(clock.sample(NaN)).toBe(0);
    expect(clock.sample(40)).toBe(0);
    expect(clock.sample(60)).toBeCloseTo(0.01);
  });
});
