import type { RuntimeReply, RuntimeRequest } from '@contracts/simulation';

export interface SimulationPort {
  warmup?(): Promise<void>;
  subscribeFailure?(listener: (error: Error) => void): () => void;
  send(request: RuntimeRequest): RuntimeReply | Promise<RuntimeReply>;
  dispose(): void;
}

export type SimulationPortFactory = () => SimulationPort;
