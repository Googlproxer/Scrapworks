import type { RuntimeReply, RuntimeRequest } from '@contracts/simulation';
import { SimulationRuntime } from '../../src/session/runtime';
import type { SimulationPort } from '../../src/session/port';

/** Test/development composition only; never imported by the normal application factory. */
export class InlineSimulationPort implements SimulationPort {
  private runtime?: SimulationRuntime;

  constructor() {
    this.runtime = new SimulationRuntime();
  }

  public send(request: RuntimeRequest): RuntimeReply {
    if (!this.runtime) throw new Error('Disposed inline port');
    return this.runtime.handle(request);
  }

  public dispose(): void {
    this.runtime?.dispose();
    this.runtime = undefined;
  }
}
