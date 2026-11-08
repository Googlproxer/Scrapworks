/**
 * Non-isolated Chromium rounds presentation times upward to a 4 ms multiple.
 * Resource startTime has finer precision. A request within that final bucket
 * cannot be ordered against the true presentation time by these metrics alone.
 * https://www.w3.org/TR/paint-timing/#mark-paint-timing
 */
export function canFollowReportedPaint(requestTime: number, paintTime: number): boolean {
  return (
    Number.isFinite(requestTime) &&
    Number.isFinite(paintTime) &&
    requestTime > 0 &&
    paintTime > 0 &&
    requestTime > paintTime - 4
  );
}
