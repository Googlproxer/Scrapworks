import type { WorldDefinition } from '../contracts/world';

/** Source bytes are copied before parsing; parsed assets remain scene-owned. */
export interface CharacterSource {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly rootUrl: string;
  readonly name: string;
}

export interface StartupResources {
  character(): Promise<CharacterSource>;
  invalidateCharacter(): void;
  definition(refresh?: boolean): Promise<WorldDefinition>;
}
