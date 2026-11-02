import { defaultProfile, validateBindingProfile } from '@contracts/input';

describe('binding profiles', () => {
  it('adds opening actions to an older profile while preserving player bindings and explicit unbinding', () => {
    const old = structuredClone(defaultProfile) as unknown as {
      schemaVersion: number;
      contexts: Record<string, Record<string, unknown>>;
    };
    old.contexts['gameplay']['move'] = [];
    delete old.contexts['gameplay']['salvage'];
    delete old.contexts['gameplay']['toggleSalvage'];
    delete old.contexts['ui']['wind'];
    const upgraded = validateBindingProfile(old);
    expect(upgraded.contexts.gameplay.move).toEqual([]);
    expect(upgraded.contexts.gameplay.salvage).toEqual(defaultProfile.contexts.gameplay.salvage);
    expect(upgraded.contexts.ui.wind).toEqual(defaultProfile.contexts.ui.wind);
    expect(old.contexts['ui']['wind']).toBeUndefined();
  });
  it('copies caller-owned configuration and preserves intentionally unbound actions', () => {
    const profile = validateBindingProfile(defaultProfile);
    const edited = {
      ...profile,
      contexts: { ...profile.contexts, gameplay: { ...profile.contexts.gameplay, move: [] } },
    };
    const validated = validateBindingProfile(edited);
    expect(validated.contexts.gameplay.move).toEqual([]);
    expect(validated).not.toBe(edited);
    expect(validated.contexts.ui.navigate).not.toBe(edited.contexts.ui.navigate);
  });
  it.each([null, {}, { schemaVersion: 2 }, { ...defaultProfile, contexts: {} }])(
    'rejects malformed profile %s',
    (value) => {
      expect(() => validateBindingProfile(value)).toThrow();
    },
  );
  it.each([NaN, Infinity, -0.1, 1])('rejects invalid stick deadzone %s', (deadzone) => {
    expect(() =>
      validateBindingProfile({
        ...defaultProfile,
        contexts: {
          ...defaultProfile.contexts,
          gameplay: {
            ...defaultProfile.contexts.gameplay,
            move: [{ kind: 'stick2d', stick: 'left', deadzone }],
          },
        },
      }),
    ).toThrow();
  });
  it('rejects unknown keyboard codes and controller buttons', () => {
    for (const binding of [
      { device: 'keyboard', code: '__proto__' },
      { device: 'gamepad', button: 'unknown' },
    ]) {
      expect(() =>
        validateBindingProfile({
          ...defaultProfile,
          contexts: {
            ...defaultProfile.contexts,
            gameplay: { ...defaultProfile.contexts.gameplay, jump: [binding] },
          },
        }),
      ).toThrow();
    }
  });
});
