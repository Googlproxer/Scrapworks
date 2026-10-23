import { defaultProfile, validateBindingProfile } from '@contracts/input';

describe('binding profiles', () => {
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
