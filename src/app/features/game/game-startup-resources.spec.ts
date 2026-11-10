import { worldFixture } from '../../../../tests/support/world-fixture';
import { GameStartupResources } from './game-startup-resources';

describe('GameStartupResources', () => {
  function setup() {
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('.json')
        ? Response.json(worldFixture())
        : new Response(new Uint8Array([1, 2, 3])),
    );
    const resources = new GameStartupResources(request);
    resources.configure('https://example.test/game/');
    return { resources, request };
  }

  it('shares downloads across menu and foreground callers, returning detached definitions', async () => {
    const { resources, request } = setup();
    resources.preload();
    const [character, definition, other] = await Promise.all([
      resources.character(),
      resources.definition(true),
      resources.definition(),
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(character.rootUrl).toBe('https://example.test/game/assets/models/');
    expect([...character.bytes]).toEqual([1, 2, 3]);
    Object.assign(definition, { terrain: ['changed'] });
    expect(other.terrain[0]).toBe('soil');
    expect((await resources.definition()).terrain[0]).toBe('soil');
    expect(await resources.character()).toBe(character);
    expect(resources.status()).toEqual({ character: 'ready', definition: 'ready' });
    resources.dispose();
  });

  it('refreshes the authored map for activation and invalidates character bytes if it changes', async () => {
    const { resources, request } = setup();
    await Promise.all([resources.character(), resources.definition()]);
    const original = worldFixture();
    const changed = { ...original, spawn: { ...original.spawn, x: original.spawn.x + 1 } };
    request.mockResolvedValueOnce(Response.json(changed));
    expect(await resources.definition(true)).toEqual(changed);
    expect(resources.status().character).toBe('idle');
    await resources.character();
    expect(request).toHaveBeenCalledTimes(4);
    resources.dispose();
  });

  it('retries failed background downloads when selected, without poisoning the cache', async () => {
    const { resources, request } = setup();
    request.mockRejectedValueOnce(new Error('offline'));
    await expect(resources.character()).rejects.toThrow('offline');
    expect(resources.status().character).toBe('failed');
    await resources.character();
    expect(resources.status().character).toBe('ready');
    resources.invalidateCharacter();
    expect(resources.status().character).toBe('failed');
    await resources.character();
    expect(request).toHaveBeenCalledTimes(3);
    resources.dispose();
  });

  it('rejects invalid world data before it can be reused', async () => {
    const { resources, request } = setup();
    request.mockResolvedValueOnce(Response.json({ version: 999 }));
    await expect(resources.definition()).rejects.toThrow();
    expect(resources.status().definition).toBe('failed');
    expect(await resources.definition()).toEqual(worldFixture());
    resources.dispose();
  });

  it.each(['configure', 'dispose'] as const)('ignores late completion after %s', async (action) => {
    const { resources, request } = setup();
    let complete!: (response: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = resources.character();
    await Promise.resolve();
    const signal = request.mock.calls[0][1]!.signal!;
    if (action === 'configure') resources.configure('https://example.test/other/');
    else resources.dispose();
    expect(signal.aborted).toBe(true);
    complete(new Response(new Uint8Array([4])));
    await expect(pending).rejects.toThrow('cancelled');
    expect(resources.status()).toEqual({ character: 'idle', definition: 'idle' });
    if (action === 'dispose') await expect(resources.character()).rejects.toThrow('closed');
    else {
      await resources.character();
      expect(String(request.mock.lastCall![0])).toContain('/other/assets/');
    }
    resources.dispose();
  });
});
