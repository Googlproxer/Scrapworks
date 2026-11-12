/** Local experiment preregistration. Measurements may refine fixture counts, never these budgets. */
export const PROTOCOL_VERSION = 1;
export const OPERATIONS = ['start', 'release', 'reverse'] as const;
export type Operation = (typeof OPERATIONS)[number];
export const VARIANTS = ['B0', 'B1', 'C1'] as const;
export type Variant = (typeof VARIANTS)[number];
export const STAGES = [
  'probe-validation',
  'baseline',
  'b1-parity',
  'c1-correctness',
  'matrix',
  'latency',
  'faults',
  'soak',
  'lifecycle',
  'headed-renderer',
  'decision',
] as const;
export const PROTOCOL = {
  version: PROTOCOL_VERSION,
  scope: 'This device only; no CI, remote execution or hosted jobs.',
  variants: VARIANTS,
  stages: STAGES,
  hardware: {
    keyboard: { connection: 'USB', model: 'not supplied' },
    gamepad: { connection: 'USB', model: 'Sony DualSense', firmware: 'not supplied' },
    display: { model: 'LG C2', resolution: [3840, 2160], configuredRefreshHz: 120 },
    physicalInputToPhoton: 'unavailable: user has no physical testing available',
    humanAB: 'unavailable: user has no physical testing available',
    otherHardware: 'out of scope: execution restricted to this device',
  },
  endpoint:
    'Main-thread earliest application-observed input to submitted frame with causal world-relative movement.',
  regressionMs: { p50: 2, p95: 5, p99: 8 },
  confidence: { oneSided: 0.95, bootstrapReplicates: 10000, blockSamples: 20 },
  sampling: { independentRuns: 5, warmupSeconds: 15, completedPerOperationDeviceCase: 1000 },
  timing: { tickHz: 20, substepsPerTick: 3, outstandingPhysicsRequests: 1, maxCatchupTicks: 5 },
  response: {
    displacementMetres: 0.0001,
    stationaryConfirmationFrames: 3,
    timeoutMs: 2000,
    note: 'Threshold must be validated against idle/contact drift before baseline qualification.',
  },
  correctness: { ticks: 10000, restoredContinuationTicks: 1000 },
  lifecycle: { cyclesPerArchitecture: 100, soakSecondsPerArchitecture: 1800 },
  delaysMs: [1, 4, 8, 16.7, 50, 100, 250],
  tapsMs: [20, 40, 60, 100],
  staticCounts: [100, 1000, 10000],
  bodyCounts: [10, 100, 1000],
  simulationMultipliers: [1, 4, 16],
  requiredCases: [
    'normal',
    'mixed',
    'simulation-heavy',
    'physics-heavy',
    'dense-contact',
    'largest-B0-qualified-mixed',
  ],
  frameGates60HzMs: { p95: 18.5, p99: 33.4 },
  displayPolicy:
    'Verify actual display/mode/cadence at run time. Emulated 60 Hz is diagnostic; 120 Hz needs its own baseline.',
  failures:
    'Correctness failure stops performance ranking. Missing samples, overflow, unresolved sustained probes or inadequate precision cannot pass.',
  execution: 'HELD: do not start any experiment run until the user explicitly releases it.',
} as const;

export function requireLocal(environment: NodeJS.ProcessEnv = process.env): void {
  if (
    environment['CI'] ||
    environment['GITHUB_ACTIONS'] ||
    environment['TF_BUILD'] ||
    environment['BUILD_BUILDID']
  )
    throw new Error('Physics-worker experiment is local/manual only; CI execution is forbidden.');
}

export function requireRunRelease(released: boolean): void {
  requireLocal();
  if (!released)
    throw new Error(
      'Experiment runs are held until the user explicitly authorizes starting the tests.',
    );
}
