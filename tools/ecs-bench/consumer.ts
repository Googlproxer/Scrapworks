import type { Fixture, Projection } from './model.ts';
import { statusFor } from './model.ts';

/** Exposed to the host: publication must escape the producing loop. */
export const projectionConsumer: { latest: Projection | undefined; records: number } = {
  latest: undefined,
  records: 0,
};
export function consumeProjection(view: Projection): void {
  projectionConsumer.latest = view;
  projectionConsumer.records += view.records.length;
}
export function releaseProjection(): void {
  projectionConsumer.latest = undefined;
  projectionConsumer.records = 0;
}

/** The bounded command stream repeats every 100 ticks. */
export function expectedDirtyCounts(fixture: Fixture): number[] {
  const prefix = new Uint32Array(fixture.size + 1);
  for (let ordinal = 0; ordinal < fixture.size; ordinal++)
    prefix[ordinal + 1] =
      prefix[ordinal] + Number(ordinal % 10 < 6 && statusFor(ordinal, fixture.workload) === 0);
  const active = prefix[fixture.size];
  const groups = fixture.size / 10;
  const replacements = fixture.workload === 'churn' ? fixture.size / 100 : 0;
  return Array.from({ length: 100 }, (_, phase) => {
    const first = phase * replacements;
    const last = first + replacements;
    const startGroup = first / 10;
    const endGroup = last / 10;
    let edits = 0;
    for (let group = phase; group < groups; group += 100)
      if (!replacements || group < startGroup || group >= endGroup) edits++;
    const replacementActive = prefix[last] - prefix[first];
    return active + replacements - replacementActive + edits * 3 + (phase === 0 ? 0 : 1);
  });
}
