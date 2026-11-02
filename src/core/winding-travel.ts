/** Device-independent angular travel. Re-entry establishes an angle without crediting a gap. */
export class WindingTravel {
  private previous: number | null = null;

  public reset(): void {
    this.previous = null;
  }

  public sample(x: number, y: number): { angle: number; degrees: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.25) {
      this.reset();
      return null;
    }
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    const previous = this.previous;
    if (previous === null) {
      this.previous = angle;
      return { angle, degrees: 0 };
    }
    const delta = ((angle - previous + 540) % 360) - 180;
    if (Math.abs(delta) < 0.1) return { angle, degrees: 0 };
    this.previous = angle;
    // Reject centre crossings/discontinuous jumps; reversals and fractional travel remain valid.
    return { angle, degrees: Math.abs(delta) > 120 ? 0 : delta };
  }
}
