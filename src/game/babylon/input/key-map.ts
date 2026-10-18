import { keyCodes } from './key-codes';

/**
 * Defines the state of each key, down or up
 */
export type KeyMapKey = (typeof keyCodes)[number];
export type KeyMap = Record<KeyMapKey, boolean>;
export type ReadonlyKeyMap = Readonly<KeyMap>;

const supportedCodes = new Set<string>(keyCodes);

export function isKeyMapKey(code: string): code is KeyMapKey {
  return supportedCodes.has(code);
}

export const initKeyMap = (): KeyMap => Object.fromEntries(keyCodes.map((code) => [code, false])) as KeyMap;
