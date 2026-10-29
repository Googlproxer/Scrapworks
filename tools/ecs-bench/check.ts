import { canonical, spendInOrder } from './model.ts';
import type { Candidate, Instance, Projection } from './model.ts';
import { load } from './load.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function step(world: Instance, ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    const pending = world.step();
    if (pending) await pending;
  }
}
function normalized(view: Projection): string {
  return JSON.stringify({
    ...view,
    records: [...view.records].sort((a, b) => a.payload.ordinal - b.payload.ordinal),
    removed: [...view.removed].sort(),
  });
}
export class Session {
  public paused = false;
  public failed = false;
  public accumulator = 0;
  public view: Projection;
  public constructor(private readonly world: Instance) {
    this.view = {
      tick: world.resources.tick,
      completed: world.resources.completed,
      records: [],
      removed: [],
    };
  }
  public async advance(delta: number): Promise<void> {
    if (this.paused || !Number.isFinite(delta) || delta <= 0) return;
    if (this.failed) throw new Error('Failed benchmark session');
    this.accumulator = Math.min(this.accumulator + delta, 0.25);
    try {
      let steps = 0;
      while (this.accumulator + 1e-10 >= 0.05 && steps++ < 5) {
        const pending = this.world.step();
        if (pending) await pending;
        this.view = await this.world.project();
        this.accumulator = Math.max(0, this.accumulator - 0.05);
      }
    } catch (error) {
      this.failed = true;
      this.accumulator = 0;
      throw error;
    }
  }
  public pause(value: boolean): void {
    this.paused = value;
    this.accumulator = 0;
  }
}

export async function check(
  candidate: Candidate,
): Promise<{ candidate: Candidate; assertions: string[] }> {
  const factory = await load(candidate);
  const oracle = await load('reference');
  const assertions: string[] = [];
  assert(
    JSON.stringify(spendInOrder(3)) ===
      JSON.stringify({ manual: 2, processor: 1, research: 0, left: 0 }),
    'Stock contention priority',
  );
  assertions.push('manual/processor/research stock contention');
  for (const workload of ['mixed', 'idle', 'active', 'churn'] as const) {
    const fixture = { size: 1000, seed: 1729, workload };
    const actual = await factory(fixture);
    const expected = await oracle(fixture);
    try {
      await actual.probe();
      await expected.probe();
      for (let i = 0; i < 1100; i++) {
        const a = actual.step();
        if (a) await a;
        expected.step();
        if (i === 0 || i === 99 || i === 1099) {
          const phases = { ...actual.phases };
          assert(
            normalized(await actual.project()) === normalized(await expected.project()),
            `${workload}: detached changed projection mismatch at ${i}`,
          );
          assert(
            JSON.stringify(actual.phases) === JSON.stringify(phases),
            `${workload}: publication overwrote simulation phase measurements`,
          );
          assert(
            canonical(await actual.capture()) === canonical(await expected.capture()),
            `${workload}: state mismatch at ${i}`,
          );
        } else {
          await actual.project();
          await expected.project();
        }
      }
      assert(actual.resources.completed > 0, `${workload}: empty processing demo`);
      const capture = await actual.capture();
      if (workload !== 'churn')
        assert(
          capture.records[6].payload.slots[0]!.quantity === 0,
          'Manual/processor stock was not committed atomically',
        );
      const owners = new Set(
        capture.records.filter((r) => r.payload.kind === 'owner').map((r) => r.payload.id),
      );
      assert(
        capture.records.every(
          (r) => r.payload.kind !== 'processor' || owners.has(r.payload.owner!),
        ),
        `${workload}: dangling owner`,
      );
      const restored = await factory(
        capture.fixture,
        JSON.parse(JSON.stringify(capture)) as typeof capture,
      );
      try {
        await step(actual, 1000);
        await step(restored, 1000);
        assert(
          canonical(await actual.capture()) === canonical(await restored.capture()),
          `${workload}: continuation mismatch`,
        );
        restored.setDirty(1);
        const view = await restored.project();
        view.records[6].payload.slots[0]!.quantity = -1;
        assert(
          (await restored.capture()).records[6].payload.slots[0]!.quantity >= 0,
          'Projection aliases authoritative nested data',
        );
      } finally {
        await restored.dispose();
      }
      assertions.push(
        `${workload}: native membership, projections, 1100-step oracle, owners, 1000-step restored continuation, detached slots`,
      );
    } finally {
      await actual.dispose();
      await expected.dispose();
    }
  }
  const fixture = { size: 1000, seed: 1729, workload: 'mixed' as const, capacity: 200010 };
  const a = await factory(fixture);
  const b = await factory(fixture);
  try {
    const original = canonical(await b.capture());
    await step(a, 3);
    assert(canonical(await b.capture()) === original, 'Cross-world component contamination');
    const session = new Session(b);
    await session.advance(60);
    assert(b.resources.tick === 5, 'Catch-up exceeded five steps');
    session.pause(true);
    await session.advance(10);
    session.pause(false);
    await session.advance(0.04);
    assert(b.resources.tick === 5, 'Pause left accumulated input');
    await session.advance(0.01);
    assert(Number(b.resources.tick) === 6, 'Resume timing mismatch');
    const completed = JSON.stringify(session.view);
    const originalStep = b.step.bind(b);
    b.step = () => {
      throw new Error('Injected failure');
    };
    let rejected = false;
    try {
      await session.advance(0.05);
    } catch {
      rejected = true;
    }
    assert(
      rejected && session.failed && completed === JSON.stringify(session.view),
      'Failure published partial state',
    );
    b.step = originalStep;
    await a.grow(100000);
    await step(a, 3);
    const expected = await oracle({ ...fixture, size: 100000 }, await a.capture());
    try {
      await step(a, 10);
      await step(expected, 10);
      assert(
        canonical(await a.capture()) === canonical(await expected.capture()),
        'Growth lost numeric store data',
      );
    } finally {
      await expected.dispose();
    }
  } finally {
    await a.dispose();
    await b.dispose();
  }
  assertions.push(
    'independent simultaneous worlds, pause, five-step catch-up, failure publication, growth',
  );
  const disposed = await factory({ size: 10, seed: 1, workload: 'mixed' });
  await disposed.dispose();
  await disposed.dispose();
  let rejected = false;
  try {
    await disposed.step();
  } catch {
    rejected = true;
  }
  assert(rejected, 'Disposed world accepted work');
  assertions.push('idempotent disposal and rejected stale world');
  return { candidate, assertions };
}
