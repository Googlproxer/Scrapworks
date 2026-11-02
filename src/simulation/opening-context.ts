import type { EntityData, WorldResources } from '@contracts/simulation';

/** Private runtime records shared only by the authoritative opening executors. */
export interface SimulationEntity extends EntityData {
  slot: number;
  generation: number;
  dirty: number;
}

export interface OpeningContext {
  readonly player: SimulationEntity;
  readonly piles: Iterable<SimulationEntity>;
  readonly resources: Pick<WorldResources, 'research' | 'productionTotals' | 'extractionTotals'>;
  allocateId(prefix: string): string;
  get(id: string): SimulationEntity | undefined;
  mark(entity: SimulationEntity, detailsOnly?: boolean): void;
  add(data: EntityData): void;
  remove(id: string): void;
}
