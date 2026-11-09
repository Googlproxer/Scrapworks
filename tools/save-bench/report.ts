import { distribution, type FixtureResult } from './model.ts';

function ms(values: readonly number[]): string {
  const value = distribution(values);
  return `${value.p50.toFixed(2)} / ${value.p95.toFixed(2)}`;
}

export function report(fixtures: readonly FixtureResult[]): string {
  const lines = [
    '# Save-format benchmark',
    '',
    'Times are p50 / p95 milliseconds (nearest rank). Raw samples and source hashes are in `result.json`.',
    '',
    'Storage deltas are browser-accounted estimates for one row after an empty database is open. They are not exact disk-file sizes. Wire bytes are exact encoded payload bytes (JSON uses UTF-8); native objects have no portable wire size.',
    '',
    'Full Save includes the real worker capture and committed repository write. Full Load includes the repository read, validation and a fresh production worker ready with its first publication. Babylon/Angular scene restoration, confirmation dialogs, database opening and asset loading are excluded. The current-object full pipeline calls the real M9 append/retention repository; alternative codecs retain an isolated single-row control.',
    '',
    'Stage timings are independent diagnostics and must not be added to the full pipeline. Warmups and correctness checks are excluded. Codec order is shuffled reproducibly each round. Fresh workers include startup; IndexedDB reads are warm browser-cache reads. No forced GC or performance thresholds.',
    '',
  ];
  for (const fixture of fixtures) {
    lines.push(
      `## ${fixture.name}`,
      '',
      `${fixture.population.toLocaleString('en-US')} entities; ${fixture.physicsBytes.toLocaleString('en-US')} native physics bytes; ${fixture.synthetic ? 'synthetic supported component shapes' : 'exported opening world'}.`,
      '',
      fixture.hostGate.accepted
        ? 'Production host save gate: accepted.'
        : `Production host save gate: **rejected — ${fixture.hostGate.error}** Full pipeline results are unavailable; codec/storage and isolated core continuation still run. No limits were raised.`,
      '',
      `Common diagnostics: capture ${ms(fixture.common.captureMs)} ms; host validation + clone ${ms(fixture.common.validateAndCloneMs)} ms; clone alone ${ms(fixture.common.cloneOnlyMs)} ms. A rejected validation time measures time to reject.`,
      '',
      '| Format | Wire bytes | Estimated storage delta bytes | Full Save ms | Full Load ms |',
      '| --- | ---: | ---: | ---: | ---: |',
    );
    for (const format of fixture.formats)
      lines.push(
        `| ${format.label} | ${format.wireBytes?.toLocaleString('en-US') ?? 'n/a'} | ${format.storage.deltaBytes.toLocaleString('en-US')} | ${format.pipeline ? ms(format.pipeline.map((s) => s.saveTotalMs)) : 'blocked'} | ${format.pipeline ? ms(format.pipeline.map((s) => s.loadTotalMs)) : 'blocked'} |`,
      );
    lines.push(
      '',
      '| Format | Encode ms | IDB write ms | IDB read ms | Decode ms | Repository Save ms | Repository Load ms | Worker restore ms |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const format of fixture.formats)
      lines.push(
        `| ${format.format} | ${ms(format.stages.map((s) => s.encodeMs))} | ${ms(format.stages.map((s) => s.writeMs))} | ${ms(format.stages.map((s) => s.readMs))} | ${ms(format.stages.map((s) => s.decodeMs))} | ${format.pipeline ? ms(format.pipeline.map((s) => s.saveRepositoryMs)) : 'blocked'} | ${format.pipeline ? ms(format.pipeline.map((s) => s.loadRepositoryMs)) : 'blocked'} | ${format.pipeline ? ms(format.pipeline.map((s) => s.restoreWorkerMs)) : 'blocked'} |`,
      );
    lines.push(
      '',
      `All formats passed exact stored round-trip comparison and ${fixture.formats[0]?.correctness.continuedTicks ?? 0}-tick native simulation continuation. Fixture SHA-256: \`${fixture.sha256}\`.`,
      '',
    );
  }
  lines.push(
    'Small sample counts are exploratory; p95 can equal the maximum. Repeat full runs on an otherwise idle machine before selecting a format. These fixtures do not predict future machine/transport saves, peak memory, frame hitches, cold disk reads, crash durability or migration effort.',
    '',
  );
  return lines.join('\n');
}
