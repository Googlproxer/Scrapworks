import type { WaterBatch, WaterSource, UtilityData } from '@contracts/environment';
import type { WorldDefinition } from '@contracts/world';
import { ENVIRONMENT_SETTINGS as settings, UTILITIES, isUtilityKind } from '@content/environment';
import type { SimulationEntity } from './opening-context';

const cleanThreshold = 100 - 1e-8;

const isCleanWater = (quality: number) => quality >= cleanThreshold;

export const waterVolume = (batches: readonly WaterBatch[]): number =>
  batches.reduce((n, b) => n + b.volume, 0);

export const waterQuality = (batches: readonly WaterBatch[]): number => {
  const volume = waterVolume(batches);
  return volume ? batches.reduce((n, b) => n + b.volume * b.quality, 0) / volume : 0;
};

export function addWater(target: WaterBatch[], batches: readonly WaterBatch[]): void {
  for (const batch of batches) {
    if (batch.volume <= 0) continue;
    const clean = isCleanWater(batch.quality);
    const same = target.find((b) => b.source === batch.source && isCleanWater(b.quality) === clean);
    if (same) {
      const volume = same.volume + batch.volume;
      same.quality = clean
        ? 100
        : Math.max(
            0,
            Math.min(100, (same.quality * same.volume + batch.quality * batch.volume) / volume),
          );
      same.volume = volume;
    } else target.push({ ...batch, quality: clean ? 100 : batch.quality });
  }
  target.sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : a.quality - b.quality,
  );
}

/** Proportional source/quality withdrawal avoids preferentially consuming one source. */
export function takeWater(batches: WaterBatch[], amount: number): WaterBatch[] {
  const volume = waterVolume(batches);
  if (volume <= 0 || amount <= 0) return [];
  const fraction = Math.min(1, amount / volume);
  const taken = batches.map((b) => ({ ...b, volume: b.volume * fraction }));
  for (const b of batches) b.volume *= 1 - fraction;
  for (let i = batches.length - 1; i >= 0; i--) if (batches[i].volume <= 0) batches.splice(i, 1);
  return taken;
}

export function lakeSources(definition: WorldDefinition): WaterSource[] {
  const seen = new Set<number>();
  const sources: WaterSource[] = [];
  const columns = definition.grid.columns;
  for (let start = 0; start < definition.terrain.length; start++) {
    if (seen.has(start) || definition.terrain[start] !== 'water') continue;
    const cells = [start];
    seen.add(start);
    for (const cell of cells) {
      const x = cell % columns;
      for (const next of [
        x > 0 ? cell - 1 : -1,
        x < columns - 1 ? cell + 1 : -1,
        cell - columns,
        cell + columns,
      ]) {
        if (
          next >= 0 &&
          next < definition.terrain.length &&
          !seen.has(next) &&
          definition.terrain[next] === 'water'
        ) {
          seen.add(next);
          cells.push(next);
        }
      }
    }
    cells.sort((a, b) => a - b);
    sources.push({
      id: `lake:${start}`,
      cells,
      volume: cells.length * settings.sourceLitresPerCell,
      extracted: 0,
      consumed: 0,
      returned: 0,
      refilled: 0,
      transferredIn: 0,
      transferredOut: 0,
    });
  }
  return sources;
}

export const newUtility = (): UtilityData => ({
  water: [],
  clean: [],
  source: null,
  overflow: null,
  charge: 0,
  fuelEnergy: 0,
  phase: 'off',
  transition: 0,
  hold: 0,
  positive: 0,
  negative: 0,
  generated: 0,
});

export function waterCapacity(entity: SimulationEntity): number {
  const kind = entity.building?.buildingId;
  return isUtilityKind(kind) ? UTILITIES[kind].litres : 0;
}

export function waterSpace(entity: SimulationEntity): number {
  const data = entity.machine?.utility;
  return data
    ? Math.max(0, waterCapacity(entity) - waterVolume(data.water) - waterVolume(data.clean))
    : 0;
}

export function consumeWater(
  sources: WaterSource[],
  batches: WaterBatch[],
  amount: number,
): WaterBatch[] {
  const taken = takeWater(batches, amount);
  for (const batch of taken) sources.find((s) => s.id === batch.source)!.consumed += batch.volume;
  return taken;
}
