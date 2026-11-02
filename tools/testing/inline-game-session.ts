import type { WorldDefinition } from '@contracts/world';
import { GameSession as HostSession, type SessionOptions } from '../../src/session/game-session';
import { InlineSimulationPort } from './inline-simulation-port';

/** Explicit inline control for tests/development; absent from normal production imports. */
export class GameSession extends HostSession {
  constructor(definition: WorldDefinition, options: SessionOptions = {}) {
    super(definition, {
      ...options,
      portFactory: options.portFactory ?? (() => new InlineSimulationPort()),
    });
  }

  public override advance(seconds: number): void {
    super.advance(seconds);
    this.flushCompleted();
  }
}
