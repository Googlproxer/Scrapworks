import type { RuntimeRequest, RuntimeReply } from '../contracts/simulation.ts';
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
const { WorkerSimulationPort } = await import('./worker-port.ts');
const { GameSession } = await import('./game-session.ts');
const { SimulationRuntime } = await import('./runtime.ts');
import { worldFixture } from '../../tests/support/world-fixture.ts';
import { SIMULATION_READY, SIMULATION_WARMUP } from '../contracts/worker-bootstrap.ts';
const definition = worldFixture();

class FakeWorker extends EventTarget {
  public terminated = 0;
  public requests: RuntimeRequest[] = [];
  public removed: string[] = [];

  public override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    this.removed.push(type);
    super.removeEventListener(type, callback, options);
  }

  public reply(reply: RuntimeReply) {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }

  public crash(message: string) {
    const event = Object.assign(new Event('error', { cancelable: true }), { message });
    this.dispatchEvent(event);
    assert(event.defaultPrevented);
  }

  public postMessage(request: RuntimeRequest) {
    this.requests.push(request);
  }

  public terminate() {
    this.terminated++;
  }
}

const request = (id: number): RuntimeRequest => ({
  protocol: 2,
  id,
  generation: 1,
  revision: 0,
  operation: 'capture',
});

test('worker timeout, message failure and disposal settle every outstanding request exactly once', async () => {
  vi.useFakeTimers();
  try {
    for (const reason of ['timeout', 'message', 'dispose', 'error']) {
      const worker = new FakeWorker(),
        port = new WorkerSimulationPort(worker as unknown as Worker);
      port.timeoutMs = 5;
      const failures = [];
      port.subscribeFailure((error) => failures.push(error.message));
      const pending = [1, 2, 3].map((id) => port.send(request(id)));
      const outcomes = Promise.allSettled(pending);
      if (reason === 'message') worker.dispatchEvent(new Event('messageerror'));
      if (reason === 'dispose') port.dispose();
      if (reason === 'error') worker.crash('crashed');
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(port.timeoutMs);
      assert((await outcomes).every((result) => result.status === 'rejected'));
      assert.equal(worker.terminated, 1);
      assert.equal(failures.length, 1);
      assert.deepEqual(worker.removed.sort(), ['error', 'message', 'messageerror']);
      worker.dispatchEvent(new Event('messageerror'));
      port.dispose();
      assert.equal(worker.terminated, 1);
      await assert.rejects(port.send(request(4)), /Disposed/);
    }
  } finally {
    vi.useRealTimers();
  }
});
test('an idle worker crash reaches the owning session without a pending request', async () => {
  const worker = new FakeWorker(),
    port = new WorkerSimulationPort(worker as unknown as Worker),
    runtime = new SimulationRuntime();
  worker.postMessage = (request) => queueMicrotask(() => worker.reply(runtime.handle(request)));
  const failures = [];
  const session = new GameSession(definition, {
    portFactory: () => port,
    onFailure: (error) => failures.push(error),
  });
  await session.ready;
  session.setPaused(true);
  await session.settled();
  const before = session.view;
  worker.crash('idle crash');
  assert.equal(session.failed, true);
  assert.equal(failures.length, 1);
  assert.deepEqual(session.view, before);
  session.dispose();
  runtime.dispose();
});

test('worker failure notification respects unsubscribe and replays the terminal error to late owners', () => {
  const worker = new FakeWorker();
  const port = new WorkerSimulationPort(worker as unknown as Worker);
  const removed: Error[] = [];
  const received: Error[] = [];
  const late: Error[] = [];
  const unsubscribe = port.subscribeFailure((error) => removed.push(error));
  unsubscribe();
  port.subscribeFailure((error) => received.push(error));
  worker.crash('terminal crash');
  port.subscribeFailure((error) => late.push(error));
  port.dispose();
  assert.deepEqual(removed, []);
  assert.equal(received.length, 1);
  assert.deepEqual(late, received);
});

test('warmup is shared, sends no world initialization, and waits for versioned readiness', async () => {
  const worker = new FakeWorker();
  const port = new WorkerSimulationPort(worker as unknown as Worker);
  const ready = port.warmup();
  assert.equal(port.warmup(), ready);
  assert.deepEqual(worker.requests, [SIMULATION_WARMUP]);
  let settled = false;
  void ready.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  worker.dispatchEvent(new MessageEvent('message', { data: SIMULATION_READY }));
  await ready;
  assert.equal(settled, true);
  assert.equal(worker.terminated, 0);
  port.dispose();
});

test('bootstrap failure, timeout and disposal reject readiness and terminate once', async () => {
  vi.useFakeTimers();
  try {
    for (const reason of ['version', 'timeout', 'dispose', 'error']) {
      const worker = new FakeWorker();
      const port = new WorkerSimulationPort(worker as unknown as Worker);
      port.timeoutMs = 5;
      const ready = port.warmup();
      const rejected = assert.rejects(ready);
      if (reason === 'version')
        worker.dispatchEvent(
          new MessageEvent('message', {
            data: { ...SIMULATION_READY, version: 999 },
          }),
        );
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(5);
      if (reason === 'dispose') port.dispose();
      if (reason === 'error') worker.crash('bootstrap crash');
      await rejected;
      await assert.rejects(port.warmup());
      port.dispose();
      assert.equal(worker.terminated, 1);
    }
  } finally {
    vi.useRealTimers();
  }
});
