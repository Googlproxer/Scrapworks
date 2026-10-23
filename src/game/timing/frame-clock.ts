/** Converts a browser's monotonic millisecond samples into active elapsed seconds. */
export class FrameClock {
  private previous?: number;

  public sample(milliseconds: number): number {
    if (!Number.isFinite(milliseconds)) return 0;
    const previous = this.previous;
    this.previous = previous === undefined ? milliseconds : Math.max(previous, milliseconds);
    return previous === undefined ? 0 : Math.max(0, milliseconds - previous) / 1000;
  }

  public reset(): void {
    this.previous = undefined;
  }
}
