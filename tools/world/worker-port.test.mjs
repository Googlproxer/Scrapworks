import './register-typescript.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { WorkerSimulationPort } = await import('../../src/session/worker-port.ts');
const { GameSession } = await import('../../src/session/game-session.ts');
const { SimulationRuntime } = await import('../../src/session/runtime.ts');
const { definition } = await import('../simulation-worker-bench/production-fixture.ts');
class FakeWorker {
  terminated = 0;
  requests = [];
  postMessage(request) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated++;
  }
}
const request = (id) => ({ protocol: 1, id, generation: 1, revision: 0, operation: 'capture' });
test('worker timeout, message failure and disposal settle every outstanding request exactly once', async () => {
  for (const reason of ['timeout', 'message', 'dispose', 'error']) {
    const worker = new FakeWorker(),
      port = new WorkerSimulationPort(worker);
    port.timeoutMs = 5;
    const failures = [];
    port.subscribeFailure((error) => failures.push(error.message));
    const pending = [1, 2, 3].map((id) => port.send(request(id)));
    const outcomes = Promise.allSettled(pending);
    if (reason === 'message') worker.onmessageerror({});
    if (reason === 'dispose') port.dispose();
    if (reason === 'error') worker.onerror({ preventDefault() {}, message: 'crashed' });
    assert((await outcomes).every((result) => result.status === 'rejected'));
    assert.equal(worker.terminated, 1);
    assert.equal(failures.length, 1);
    port.dispose();
    assert.equal(worker.terminated, 1);
    await assert.rejects(port.send(request(4)), /Disposed/);
  }
});
test('an idle worker crash reaches the owning session without a pending request', async () => {
  const worker = new FakeWorker(),
    port = new WorkerSimulationPort(worker),
    runtime = new SimulationRuntime();
  worker.postMessage = (request) =>
    queueMicrotask(() => worker.onmessage({ data: runtime.handle(request) }));
  const failures = [];
  const session = new GameSession(definition, {
    portFactory: () => port,
    onFailure: (error) => failures.push(error),
  });
  await session.ready;
  session.setPaused(true);
  await session.settled();
  const before = session.view;
  worker.onerror({ preventDefault() {}, message: 'idle crash' });
  assert.equal(session.failed, true);
  assert.equal(failures.length, 1);
  assert.deepEqual(session.view, before);
  session.dispose();
  runtime.dispose();
});
