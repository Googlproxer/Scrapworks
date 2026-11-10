import { worldFixture } from '../../../../tests/support/world-fixture';
import { InlineSimulationPort } from '../../../../tools/testing/inline-simulation-port';
import { GameSessionOwner } from './game-session-owner';

describe('GameSessionOwner preload ownership', () => {
  function setup() {
    const ports: (InlineSimulationPort & {
      warmup: ReturnType<typeof vi.fn<() => Promise<void>>>;
    })[] = [];
    const factory = vi.fn(() => {
      const port = Object.assign(new InlineSimulationPort(), {
        warmup: vi.fn(async () => undefined),
      });
      vi.spyOn(port, 'send');
      vi.spyOn(port, 'dispose');
      ports.push(port);
      return port;
    });
    const owner = new GameSessionOwner(factory, false);
    return { owner, ports, factory };
  }

  it('warms once without a world or tick, then transfers the same port to activation', async () => {
    const { owner, ports, factory } = setup();
    owner.prewarm();
    owner.prewarm();
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ports[0].warmup).toHaveBeenCalledTimes(1);
    expect(ports[0].send).not.toHaveBeenCalled();
    expect(owner.current).toBeUndefined();
    expect(owner.runId()).toBeNull();
    expect(owner.warmState()).toBe('ready');
    await owner.initialize(worldFixture());
    expect(factory).toHaveBeenCalledTimes(1);
    expect(owner.warmState()).toBe('claimed');
    owner.prewarm();
    expect(factory).toHaveBeenCalledTimes(1);
    owner.destroy();
    expect(ports[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps validation separate from the warm activation port', async () => {
    const { owner, ports, factory } = setup();
    owner.prewarm();
    const validation = await owner.prepare(worldFixture(), null, 'validation');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(ports[0].send).not.toHaveBeenCalled();
    validation.dispose();
    const activation = await owner.prepare(worldFixture(), null);
    expect(factory).toHaveBeenCalledTimes(2);
    owner.commit(activation, 'new-run');
    owner.destroy();
    expect(ports.map((port) => vi.mocked(port.dispose).mock.calls.length)).toEqual([1, 1]);
  });

  it('disposes a failed warm port and uses a fresh foreground port', async () => {
    const { owner, ports, factory } = setup();
    factory.mockImplementationOnce(() => {
      const port = Object.assign(new InlineSimulationPort(), {
        warmup: vi.fn(async () => {
          throw new Error('bootstrap failed');
        }),
      });
      vi.spyOn(port, 'dispose');
      ports.push(port);
      return port;
    });
    owner.prewarm();
    await Promise.resolve();
    expect(owner.warmState()).toBe('failed');
    expect(ports[0].dispose).toHaveBeenCalledTimes(1);
    await owner.initialize(worldFixture());
    expect(factory).toHaveBeenCalledTimes(2);
    owner.destroy();
  });

  it('releases an unused warm port on destruction and ignores late readiness', async () => {
    const { owner, ports } = setup();
    owner.prewarm();
    // The readiness callback is still queued when destruction releases the idle lease.
    owner.destroy();
    owner.prewarm();
    await Promise.resolve();
    expect(ports).toHaveLength(1);
    expect(ports[0].dispose).toHaveBeenCalledTimes(1);
    expect(owner.warmState()).not.toBe('ready');
  });
});
