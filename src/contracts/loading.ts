/** Progress describes the current task, rather than an estimated whole-load percentage. */
export interface LoadingStatus {
  readonly task: string;
  readonly progress: number | null;
}

/** Some SDKs report unknown totals or out-of-order progress. Keep those out of the UI. */
export function loadingProgress(previous: number | null, value: number): number | null {
  if (!Number.isFinite(value)) return previous;
  return Math.max(previous ?? 0, Math.min(1, Math.max(0, value)));
}
