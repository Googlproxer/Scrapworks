import { Reference } from '../ecs-bench/adapters/reference.ts';
import { check as adapterCheck } from '../ecs-bench/check.ts';
import { Client } from './client.ts';
import { Runtime, movementProbe } from './runtime.ts';
import { assert, Credits, epoch, validRequest } from './protocol.ts';
import type { Capture, Options, Reply, Request } from './protocol.ts';

const same = (a: unknown, b: unknown, message: string): void =>
  assert(JSON.stringify(a) === JSON.stringify(b), message);
async function capture(client: Client): Promise<Capture> {
  const r = await client.request('capture');
  assert(r.capture, 'Missing capture');
  return r.capture;
}
export async function correctness(options: Options): Promise<{ assertions: string[] }> {
  const assertions: string[] = [];
  await adapterCheck(options.candidate);
  assertions.push(
    'Existing candidate oracle, ownership, detachment, growth, mutation, contention, restored continuation and independent-world checks',
  );
  const client = new Client({ ...options, size: 1000, workload: 'churn' });
  let restored: Client | undefined;
  const reference = new Reference(client.options);
  try {
    await client.initialize();
    for (let i = 0; i < 120; i++) {
      const result = client.request('advance', {
        steps: 1,
        commands: [{ sequence: i + 1, value: i }],
        input: { x: i % 2, z: 0, sprint: false },
      });
      if (result instanceof Promise) await result;
      reference.step();
      reference.project();
    }
    let captured = await capture(client);
    same(captured.world, reference.capture(), 'Worker/inline world diverged from plain reference');
    same(client.records, captured.world.records, 'Applied changed/removal cache diverged');
    assert(captured.ledger.applied === 120, 'Command applied count');
    await client.request('advance', { steps: 0, commands: [{ sequence: 120, value: 119 }] });
    same((await capture(client)).ledger, captured.ledger, 'Duplicate command was accepted');
    const before = client.tick;
    await client.pause();
    await client.request('advance', { steps: 5, input: { x: 1, z: 1, sprint: true } });
    assert(client.tick === before, 'Paused world advanced');
    assert((await capture(client)).ledger.input.x === 0, 'Suspension retained movement');
    await client.resume();
    const backlog = new Credits();
    backlog.add(10000);
    assert(backlog.take(5) === 5 && backlog.elapsed === 0, 'Catch-up was not bounded');
    await client.request('advance', { steps: 5 });
    assert(client.tick === before + 5, 'Five-step catch-up failed');
    const slow = client.request('advance', {
      steps: 5,
      yieldSteps: true,
      delayMs: 30,
      commands: [{ sequence: 121, value: 121 }],
    });
    const stopped = client.pause();
    const [, pauseReply] = await Promise.all([slow, stopped]);
    same(pauseReply.cancelledCommands, [121], 'Suspension did not acknowledge cancelled command');
    const cancelled = (await capture(client)).ledger;
    assert(cancelled.cancelled === 1 && cancelled.applied === 120, 'Cancelled command was applied');
    assert(
      cancelled.accepted === cancelled.applied + cancelled.cancelled,
      'Command accounting gap',
    );
    const afterPause = (await capture(client)).world.resources.tick;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert(
      (await capture(client)).world.resources.tick === afterPause,
      'Advancement after pause acknowledgement',
    );
    assert(afterPause - (before + 5) <= 5, 'In-flight pause exceeded credit bound');
    await client.resume();
    await client.request('clock-start');
    await new Promise((resolve) => setTimeout(resolve, 110));
    await client.request('clock-poll');
    assert(client.tick > before + 5, 'Worker-owned clock did not advance');
    await client.pause();
    const clockStopped = (await capture(client)).world.resources.tick;
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert(
      (await capture(client)).world.resources.tick === clockStopped,
      'Worker clock advanced after suspension',
    );
    await client.resume();
    captured = await capture(client);
    restored = new Client(client.options);
    await restored.initialize(captured);
    for (let i = 0; i < 1000; i++) {
      const a = client.request('advance', { steps: 1 });
      if (a instanceof Promise) await a;
      const b = restored.request('advance', { steps: 1 });
      if (b instanceof Promise) await b;
    }
    same(await capture(client), await capture(restored), 'Fresh runtime 1000-step continuation');
    const nextCommand = { sequence: captured.ledger.lastSequence + 1, value: 65537 };
    await client.request('advance', { steps: 1, commands: [nextCommand] });
    await restored.request('advance', { steps: 1, commands: [nextCommand] });
    same(await capture(client), await capture(restored), 'Restored command stream continuation');
    const pendingCommand = { sequence: nextCommand.sequence + 1, value: 65539 };
    await client.request('advance', { steps: 0, commands: [pendingCommand] });
    const pendingCapture = await capture(client);
    same(pendingCapture.pendingCommands, [pendingCommand], 'Accepted pending command not captured');
    await restored.initialize(pendingCapture);
    await client.request('advance', { steps: 1 });
    await restored.request('advance', { steps: 1 });
    same(
      await capture(client),
      await capture(restored),
      'Restored pending command was lost or repeated',
    );
    const movement = (await client.request('movement')).movement;
    same(
      movement,
      movementProbe(),
      'Actual Simulation/PlayerMotor movement and placement mismatch',
    );
    assertions.push(
      'Tick-assigned reference equivalence, full/delta cache, nested edits/removals, 120 exactly-once commands, explicit cancellation acknowledgement, pause/resume, five-step catch-up and interrupted batch',
    );
    assertions.push(
      'Fresh worker/runtime restoration followed by 1000 matching steps and a new command; actual production Simulation/PlayerMotor 1000-step movement/placement probe',
    );
    await client.request('dirty', { fraction: 0 });
    const frame = client.latest?.frame;
    if (frame) {
      client.apply(frame); // Duplicate is harmless.
      let gap = false;
      try {
        client.apply({ ...frame, version: client.version + 2, base: client.version + 1 });
      } catch {
        gap = true;
      }
      assert(gap, 'Publication gap was ignored');
    }
    // Explicit transport-level resynchronization uses a new full initialization from a plain capture.
    const resync = await capture(client);
    await client.initialize(resync);
    same(client.records, resync.world.records, 'Full resynchronization mismatch');
    await client.request('fail');
    const completeTick = client.tick;
    let failed = false;
    try {
      await client.request('advance', { steps: 1 });
    } catch {
      failed = true;
    }
    assert(failed && client.tick === completeTick, 'Failure exposed partial state');
    let resumed = false;
    try {
      await client.request('advance', { steps: 1 });
      resumed = true;
    } catch {
      /* Expected terminal session. */
    }
    assert(!resumed, 'Failed world resumed without replacement');
    await client.initialize(resync);
    same(client.records, resync.world.records, 'Repeated initialize contaminated data');
    const retired = client.request('advance', { steps: 5, delayMs: 30, yieldSteps: true });
    const retiredSettled =
      retired instanceof Promise
        ? retired.then(
            () => false,
            () => true,
          )
        : Promise.resolve(false);
    await client.initialize(resync);
    assert(await retiredSettled, 'Replacement did not reject an old request');
    await new Promise((resolve) => setTimeout(resolve, 50));
    same(await capture(client), resync, 'Old asynchronous work mutated replacement world');
    assertions.push(
      'Failure retains last complete view, failed session is terminal, replacement, resynchronization and repeated initialization',
    );
  } finally {
    await client.dispose();
    await client.dispose();
    await restored?.dispose();
    reference.dispose();
  }
  const envelope: Request = {
    protocol: 1,
    generation: 1,
    revision: 0,
    id: 1,
    operation: 'initialize',
    sentEpoch: epoch(),
    options: { ...options, size: 1000 },
  };
  const runtime = new Runtime();
  runtime.handle(envelope);
  const stale = runtime.handle({
    ...envelope,
    generation: 99,
    id: 2,
    operation: 'advance',
    steps: 1,
  }) as Reply;
  assert(!stale.ok, 'Stale generation accepted');
  let invalid = false;
  try {
    validRequest({ ...envelope, steps: 6 });
  } catch {
    invalid = true;
  }
  assert(invalid, 'Unbounded credits accepted');
  invalid = false;
  try {
    validRequest({
      ...envelope,
      commands: Array.from({ length: 257 }, (_, i) => ({ sequence: i + 1, value: i })),
    });
  } catch {
    invalid = true;
  }
  assert(invalid, 'Unbounded command queue accepted');
  runtime.handle({ ...envelope, id: 3, operation: 'dispose' });
  if (options.execution === 'worker') {
    const doomed = new Client({ ...options, size: 1000 });
    await doomed.initialize();
    const pending = doomed.request('advance', { steps: 1, delayMs: 200 });
    assert(pending instanceof Promise, 'Worker was synchronous');
    const settled = pending.then(
      () => false,
      () => true,
    );
    doomed.crash();
    assert(await settled, 'Termination stranded request');
    await doomed.dispose();
    const timeout = new Client({ ...options, size: 1000 });
    await timeout.initialize();
    timeout.timeoutMs = 20;
    let timedOut = false;
    try {
      await timeout.request('advance', { steps: 1, delayMs: 200 });
    } catch {
      timedOut = true;
    }
    assert(timedOut, 'Unresponsive worker did not time out');
    await timeout.dispose();
    assertions.push(
      'Unexpected termination and timeout settle pending requests and permit disposal',
    );
  }
  assertions.push(
    'Malformed messages, stale generation, bounded credits/commands, duplicate/gapped publication and idempotent teardown',
  );
  return { assertions };
}
