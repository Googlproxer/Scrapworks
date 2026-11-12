import type { WorkloadSpec } from './fixtures.ts';
import type { ContactCourse } from './contact-fixtures.ts';
export type ScheduleKind = 'validation' | 'baseline' | 'latency' | 'supplement' | 'overhead' | 'pressure' | 'fixture-smoke' | 'contacts' | 'corner' | 'contacts-corrected';
export interface RenderJob { id: string; variant: 'B0' | 'B0-plain' | 'B1' | 'C1' | 'B0-contact' | 'C1-contact'; device: 'keyboard' | 'synthetic-gamepad'; run: number; cycles: number; hold: number; seed: number; case: string; spec?: WorkloadSpec; fault?: string; mode?: 'supplement' | 'overhead'; pressure?: 'main' | 'background'; axis?: 'horizontal' | 'vertical'; course?: ContactCourse; fixedCamera?: boolean; supportId?: string }
export const CASES: { name: string; spec?: WorkloadSpec }[] = [
  { name: 'normal' },
  { name: 'mixed', spec: { level: 1, profile: 'P0', count: 0 } },
  { name: 'simulation-heavy', spec: { level: 3, profile: 'P0', count: 0 } },
  { name: 'physics-heavy', spec: { level: 1, profile: 'awake', count: 1000 } },
  { name: 'dense-contact', spec: { level: 1, profile: 'contacts', count: 1000 } },
  { name: 'largest-mixed', spec: { level: 3, profile: 'contacts', count: 100 } },
  // Additional qualification for the persistent-activity soak; original six cases stay intact.
  { name: 'steady-soak', spec: { level: 2, profile: 'awake', count: 1000 } },
];
export function jobs(kind: ScheduleKind): RenderJob[] {
  if (kind === 'contacts' || kind === 'corner' || kind === 'contacts-corrected') return (kind === 'corner' ? ['corner-contact'] as const : kind === 'contacts-corrected' ? ['wall-corner', 'crate-contact', 'platform-side', 'dense-contacts'] as const : ['free-space', 'wall-corner', 'crate-contact', 'platform-support', 'platform-side', 'dense-contacts'] as const).flatMap((course, index) => [false, true].flatMap(fixedCamera => (['keyboard', 'synthetic-gamepad'] as const).flatMap(device => (fixedCamera ? ['C1-contact', 'B0-contact'] as const : ['B0-contact', 'C1-contact'] as const).map(variant => ({ id: `contacts-v2-${course}-${fixedCamera ? 'fixed' : 'follow'}-${device}-${variant}-${Date.now()}`, variant, device, run: 1, cycles: course === 'platform-support' ? 5 : 1, hold: course === 'platform-support' ? 400 : course === 'corner-contact' ? 6000 : course === 'wall-corner' ? 3000 : 1000, seed: 20261111 + index, case: course, course, fixedCamera, axis: course === 'free-space' ? 'horizontal' as const : undefined, supportId: course === 'platform-support' ? 'mover' : undefined })))));
  if (kind === 'fixture-smoke') return CASES.map((workload, run) => ({ id: `fixture-smoke-horizontal-${workload.name}-${Date.now()}`, variant: 'B0', device: 'keyboard', run: run + 1, cycles: 5, hold: 400, seed: 20261111, case: workload.name, spec: workload.spec, axis: 'horizontal' }));
  if (kind === 'pressure') return (['main', 'background'] as const).flatMap(pressure => (['keyboard', 'synthetic-gamepad'] as const).flatMap(device => (['B0', 'C1'] as const).map(variant => ({ id: `pressure-${pressure}-${variant}-${device}-${Date.now()}`, variant, device, run: 1, cycles: 60, hold: 400, seed: 20261111, case: pressure + '-pressure', pressure, axis: 'horizontal' as const }))));
  if (kind === 'overhead') return Array.from({ length: 5 }, (_, run) => (run % 2 ? ['B0', 'B0-plain'] : ['B0-plain', 'B0']).map((variant): RenderJob => ({ id: `overhead-${variant}-${run + 1}-${Date.now()}`, variant: variant as 'B0' | 'B0-plain', device: 'keyboard', run: run + 1, cycles: 0, hold: 0, seed: 20261111, case: 'normal', mode: 'overhead' }))).flat();
  if (kind === 'supplement') return (['B0', 'B1', 'C1'] as const).flatMap(variant => (['keyboard', 'synthetic-gamepad'] as const).map(device => ({ id: `supplement-${variant}-${device}-${Date.now()}`, variant, device, run: 1, cycles: 0, hold: 0, seed: 20261111, case: 'normal', mode: 'supplement' as const, fault: device === 'keyboard' ? 'init-once' : undefined })));
  if (kind === 'validation') return [...['none', 'delay-50', 'frame', 'drop', 'stale'].map((fault, run): RenderJob => ({ id: `validation-${fault}-${Date.now()}`, variant: 'B0', device: 'keyboard', run, cycles: fault === 'drop' || fault === 'stale' ? 1 : 20, hold: 400, seed: 20261111, case: 'normal', fault })), { id: `validation-gamepad-${Date.now()}`, variant: 'B0', device: 'synthetic-gamepad', run: 0, cycles: 20, hold: 400, seed: 20261111, case: 'normal' }];
  const result: RenderJob[] = [];
  const cases = kind === 'baseline' ? CASES.slice(0, 1) : CASES;
  for (const [caseIndex, workload] of cases.entries()) for (const device of ['keyboard', 'synthetic-gamepad'] as const) for (let run = 0; run < 5; ++run) {
    const order: ('B0' | 'C1')[] = kind === 'baseline' ? ['B0'] : run % 2 ? ['C1', 'B0'] : ['B0', 'C1'];
    for (const variant of order) result.push({ id: `${kind}-horizontal-${workload.name}-${variant}-${device}-run${run + 1}-${Date.now()}`, variant, device, run: run + 1, cycles: 220, hold: 250, seed: 20261111 + caseIndex * 100 + run, case: workload.name, spec: workload.spec, axis: 'horizontal' });
  }
  return result;
}
