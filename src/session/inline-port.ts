import type { RuntimeReply, RuntimeRequest } from '@contracts/simulation';
import type { SimulationOptions } from '@simulation/simulation';
import { SimulationRuntime } from './runtime';
import type { SimulationPort } from './port';

/** Test/development composition only; never imported by the normal application factory. */
export class InlineSimulationPort implements SimulationPort {
  private runtime?: SimulationRuntime;
  constructor(options: Pick<SimulationOptions, 'content' | 'system'> = {}) {
    this.runtime = new SimulationRuntime(options);
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
