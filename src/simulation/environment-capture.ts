import type { SimulationSnapshot } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { ENVIRONMENT_SETTINGS as settings, isUtilityKind, isPipe } from '@content/environment';
import { lakeSources, waterCapacity, waterVolume } from './water';
import { fluidPorts } from '@content/environment';
import { facingPorts, isMaterialPort, portDirection } from '@content/transport';

const record = (value: unknown, keys: readonly string[]): void => {
  check(
    !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((k) => keys.includes(k)),
    'Invalid environmental record',
  );
};

const finite = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;

const integer = (n: unknown, max = Number.MAX_SAFE_INTEGER): boolean =>
  finite(n, max) && Number.isSafeInteger(n);

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-5;

/** Environmental ownership and source conservation are checked before native-world reconstruction. */
export function assertEnvironmentSnapshot(save: SimulationSnapshot): void {
  const state = save.resources.environment;
  if (!state) {
    check(save.contentVersion !== 'restoration-1', 'Missing environmental saved state');
    check(!save.entities.some((e) => e.machine?.utility), 'Missing environment');
    return;
  }
  record(state, [
    'health',
    'sources',
    'weather',
    'connections',
    'nextUpdate',
    'completed',
    'completedTick',
  ]);
  check(
    Array.isArray(state.health) &&
      state.health.length === save.definition.terrain.length &&
      state.health.every((h) => finite(h, 100)),
    'Invalid cell health',
  );
  check(
    integer(state.nextUpdate) &&
      state.nextUpdate > save.resources.tick &&
      state.nextUpdate <= save.resources.tick + settings.cadenceTicks,
    'Invalid environment cadence',
  );
  check(
    typeof state.completed === 'boolean' &&
      (state.completed
        ? integer(state.completedTick, save.resources.tick)
        : state.completedTick === null),
    'Invalid restoration checkpoint',
  );
  const weather = state.weather;
  record(weather, ['random', 'kind', 'endTick', 'nextKind', 'nextTick', 'nextDuration']);
  check(
    integer(weather.random, 0xffffffff) &&
      weather.random > 0 &&
      ['clear', 'rain', 'dunkelflaute'].includes(weather.kind) &&
      ['rain', 'dunkelflaute'].includes(weather.nextKind) &&
      integer(weather.endTick) &&
      integer(weather.nextTick) &&
      integer(weather.nextDuration) &&
      weather.nextDuration >= 900 &&
      weather.nextDuration <= 1500,
    'Invalid weather state',
  );
  if (weather.kind === 'clear')
    check(
      weather.nextTick >= save.resources.tick && weather.nextTick <= save.resources.tick + 6000,
      'Invalid weather forecast',
    );
  else
    check(
      weather.endTick > save.resources.tick - 1 &&
        weather.endTick === weather.nextTick + weather.nextDuration &&
        weather.kind === weather.nextKind,
      'Invalid weather event',
    );
  const expected = lakeSources(save.definition);
  check(
    Array.isArray(state.sources) && state.sources.length === expected.length,
    'Invalid water sources',
  );
  const outstanding = new Map<string, number>();
  for (let i = 0; i < expected.length; i++) {
    const source = state.sources[i],
      original = expected[i];
    record(source, [
      'id',
      'cells',
      'volume',
      'extracted',
      'consumed',
      'returned',
      'refilled',
      'transferredIn',
      'transferredOut',
    ]);
    check(
      source.id === original.id &&
        JSON.stringify(source.cells) === JSON.stringify(original.cells) &&
        [
          source.volume,
          source.extracted,
          source.consumed,
          source.returned,
          source.refilled,
          source.transferredIn,
          source.transferredOut,
        ].every((n) => finite(n)),
      'Invalid lake state',
    );
    const held = source.extracted - source.consumed - source.returned;
    check(
      held >= -1e-5 &&
        source.volume + held <= original.volume + 1e-5 &&
        close(
          source.volume,
          original.volume -
            source.extracted +
            source.returned +
            source.refilled +
            source.transferredIn -
            source.transferredOut,
        ),
      'Invalid lake conservation',
    );
    outstanding.set(source.id, 0);
  }
  const utilities = save.entities.filter((e) => e.machine?.utility);
  check(
    close(
      state.sources.reduce((n, s) => n + s.transferredIn, 0),
      state.sources.reduce((n, s) => n + s.transferredOut, 0),
    ),
    'Invalid inter-lake transfers',
  );
  for (const entity of save.entities) {
    const kind = entity.building?.buildingId;
    if (!entity.machine) continue;
    check(isUtilityKind(kind) === !!entity.machine.utility, 'Invalid utility ownership');
    if (!entity.machine.utility) continue;
    const data = entity.machine.utility;
    record(data, [
      'water',
      'clean',
      'source',
      'overflow',
      'charge',
      'fuelEnergy',
      'phase',
      'transition',
      'hold',
      'positive',
      'negative',
      'generated',
    ]);
    check(
      data.source === null || state.sources.some((s) => s.id === data.source),
      'Invalid utility source',
    );
    if (kind === 'water-pump' || kind === 'water-return') {
      const b = entity.building!,
        d = portDirection(b, 'front'),
        x = b.cell.column + d.column,
        z = b.cell.row + d.row;
      const source = state.sources.find((s) =>
        s.cells.includes(z * save.definition.grid.columns + x),
      );
      check(
        x >= 0 &&
          z >= 0 &&
          x < save.definition.grid.columns &&
          z < save.definition.grid.rows &&
          source &&
          (!data.source || source.id === data.source),
        'Invalid shoreline installation',
      );
    } else check(data.source === null, 'Unexpected source binding');
    check(
      data.overflow === null ||
        (kind === 'pipe-junction' && ['north', 'east', 'south', 'west'].includes(data.overflow)),
      'Invalid overflow direction',
    );
    check(
      finite(data.charge, kind === 'battery' ? settings.batteryJoules : 0) &&
        finite(data.fuelEnergy, kind === 'coal-generator' ? settings.coalJoules : 0),
      'Invalid stored energy/fuel',
    );
    check(
      ['off', 'starting', 'running', 'stopping'].includes(data.phase) &&
        finite(data.transition, settings.coalStartSeconds) &&
        finite(data.hold, settings.coalHoldSeconds) &&
        finite(data.generated, settings.coalWatts) &&
        finite(data.positive, settings.greenhouseInfluence) &&
        finite(data.negative, settings.coalWatts * settings.coalPollutionPerJoule * 2),
      'Invalid utility work/transition',
    );
    if (kind !== 'coal-generator')
      check(
        data.phase === 'off' &&
          data.transition === 0 &&
          data.hold === 0 &&
          data.generated === 0 &&
          data.negative === 0,
        'Unexpected generator state',
      );
    if (kind === 'coal-generator')
      check(
        data.phase === 'starting'
          ? data.transition > 0 && data.transition <= settings.coalStartSeconds
          : data.phase === 'stopping'
            ? data.transition > 0 && data.transition <= settings.coalStopSeconds
            : data.transition === 0,
        'Invalid coal ramp',
      );
    if (kind !== 'greenhouse' && kind !== 'air-scrubber')
      check(data.positive === 0, 'Unexpected restoration work');
    for (const batches of [data.water, data.clean]) {
      check(Array.isArray(batches) && batches.length <= 8192, 'Invalid water buffer');
      for (const batch of batches) {
        record(batch, ['source', 'volume', 'quality']);
        check(
          outstanding.has(batch.source) &&
            finite(batch.volume) &&
            batch.volume > 0 &&
            finite(batch.quality, 100),
          'Invalid attributed water',
        );
        outstanding.set(batch.source, outstanding.get(batch.source)! + batch.volume);
      }
    }
    check(
      (kind === 'water-treatment' || !data.clean.length) &&
        data.clean.every((b) => b.quality === 100),
      'Invalid treated output',
    );
    check(
      waterVolume(data.water) + waterVolume(data.clean) <=
        waterCapacity(entity as import('./opening-context').SimulationEntity) + 1e-6,
      'Overfull water buffer',
    );
    if (isPipe(kind)) check(!entity.building!.collision, 'Pipe must remain walkable');
  }
  for (const source of state.sources)
    check(
      close(source.extracted - source.consumed - source.returned, outstanding.get(source.id) ?? 0),
      'Unowned or duplicated source water',
    );
  check(
    Array.isArray(state.connections) && state.connections.length <= utilities.length * 4,
    'Invalid fluid graph',
  );
  const ids = new Set([
      ...save.entities.map((e) => e.id),
      ...(save.resources.factory?.connections ?? []).map((e) => e.id),
      ...(save.resources.factory?.transport?.connections ?? []).map((e) => e.id),
    ]),
    outputs = new Set<string>(),
    inputs = new Set<string>(),
    pairs = new Set<string>();
  for (const edge of state.connections) {
    record(edge, ['id', 'from', 'to', 'input', 'output']);
    const a = utilities.find((e) => e.id === edge.from),
      b = utilities.find((e) => e.id === edge.to);
    check(
      typeof edge.id === 'string' &&
        edge.id.length > 0 &&
        edge.id.length <= 256 &&
        !ids.has(edge.id) &&
        a &&
        b &&
        isMaterialPort(edge.output) &&
        isMaterialPort(edge.input),
      'Invalid fluid endpoints',
    );
    ids.add(edge.id);
    const output = JSON.stringify([edge.from, edge.output]),
      input = JSON.stringify([edge.to, edge.input]),
      pair = JSON.stringify([edge.from, edge.to].sort());
    check(
      !outputs.has(output) &&
        !inputs.has(input) &&
        !pairs.has(pair) &&
        fluidPorts(a.building!.buildingId).output.includes(edge.output) &&
        fluidPorts(b.building!.buildingId).input.includes(edge.input) &&
        facingPorts(a.building!, edge.output, b.building!, edge.input),
      'Invalid fluid ports',
    );
    outputs.add(output);
    inputs.add(input);
    pairs.add(pair);
  }
}
