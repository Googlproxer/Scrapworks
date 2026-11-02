import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, test } from 'vitest';
import type { FileCoverageData } from '@vitest/istanbul-lib-coverage';
import { coverageOptions, projectRoot } from './config.ts';
import {
  cleanCoverage,
  generateReport,
  inScope,
  mergeCoverage,
  relativeSource,
  remapBrowserCoverage,
  summaryTable,
  writeSummary,
} from './report.ts';

const temporary = path.join(projectRoot, 'tmp');
const fixtures: string[] = [];
function fixture() {
  fs.mkdirSync(temporary, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporary, 'coverage-test-'));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/example.ts'),
    'export function example(value: boolean) {\n  return value ? 1 : 2;\n}\n',
  );
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(temporary));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const location = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 20 } });
function coverage(root: string, hits: [number, number], offset = 0): FileCoverageData {
  return {
    path: path.join(root, 'src/example.ts'),
    statementMap: { [offset]: location(1), [offset + 1]: location(2) },
    s: { [offset]: hits[0], [offset + 1]: hits[1] },
    fnMap: { [offset]: { name: 'example', decl: location(1), loc: location(2), line: 1 } },
    f: { [offset]: Math.max(...hits) },
    branchMap: {
      [offset]: {
        type: 'cond-expr',
        loc: location(2),
        line: 2,
        locations: [location(1), location(2)],
      },
    },
    b: { [offset]: hits },
  };
}

test('combines complementary browser/Node hits by source location, including differently numbered entries', () => {
  const root = fixture();
  const node = coverage(root, [1, 0]);
  const browser = { ...coverage(root, [0, 1], 10), path: pathToFileURL(node.path).href };
  const merged = mergeCoverage([{ node }, { browser }], 'game', root);
  assert.equal(merged.files().length, 1);
  const summary = merged.getCoverageSummary();
  for (const metric of ['lines', 'statements', 'functions', 'branches'] as const) {
    assert.equal(summary[metric].pct, 100);
  }
  assert.equal(merged.getCoverageSummary().statements.total, 2);
  assert.equal(merged.getCoverageSummary().branches.total, 2);
});

test('retains untouched source files as uncovered in the denominator', () => {
  const root = fixture();
  const covered = coverage(root, [1, 1]);
  const untouched = { ...coverage(root, [0, 0]), path: path.join(root, 'src/untouched.ts') };
  fs.writeFileSync(untouched.path, 'export const untouched = 1;\n');
  const summary = mergeCoverage([{ covered, untouched }], 'game', root).getCoverageSummary();
  assert.equal(summary.statements.pct, 50);
  assert.equal(summary.statements.total, 4);
});

test('does not mix a differently transformed untouched placeholder into measured coverage', () => {
  const root = fixture();
  const untouched = coverage(root, [0, 0]);
  untouched.statementMap['2'] = location(3);
  untouched.s['2'] = 0;
  const measured = coverage(root, [1, 1]);
  for (const inputs of [
    [{ untouched }, { measured }],
    [{ measured }, { untouched }],
  ]) {
    const summary = mergeCoverage(inputs, 'game', root).getCoverageSummary();
    assert.equal(summary.statements.total, 2);
    assert.equal(summary.statements.pct, 100);
  }
});

test('counts a class field once when collectors map its declaration and initializer differently', () => {
  const root = fixture();
  fs.writeFileSync(
    path.join(root, 'src/example.ts'),
    'export class Example {\n  public value = 1;\n}\n',
  );
  const node = coverage(root, [1, 0]);
  node.statementMap = { 0: { start: { line: 2, column: 17 }, end: { line: 2, column: 18 } } };
  node.s = { 0: 1 };
  const browser = {
    ...node,
    statementMap: { 0: { start: { line: 2, column: 2 }, end: { line: 2, column: 18 } } },
  };
  const summary = mergeCoverage([{ node }, { browser }], 'game', root).getCoverageSummary();
  assert.equal(summary.statements.total, 1);
  assert.equal(summary.statements.pct, 100);
});

test('counts a source statement once when transformed source maps disagree on its end', () => {
  const root = fixture();
  const node = coverage(root, [1, 0]);
  node.statementMap = { 0: location(1) };
  node.s = { 0: 1 };
  const browser = {
    ...node,
    statementMap: { 0: { ...location(1), end: { line: 1, column: 30 } } },
  };
  const summary = mergeCoverage([{ node }, { browser }], 'game', root).getCoverageSummary();
  assert.equal(summary.statements.total, 1);
  assert.equal(summary.statements.pct, 100);
});

test('restores JSON line-only end columns before merging source ranges', () => {
  const root = fixture();
  const node = coverage(root, [1, 1]);
  node.statementMap['0'].start.column = 1;
  node.statementMap['0'].end.column = Infinity;
  const serialized: unknown = JSON.parse(JSON.stringify({ node }));
  const merged = mergeCoverage([serialized], 'game', root);
  const file = merged.fileCoverageFor(fs.realpathSync(node.path));
  assert.equal(
    file.statementMap['0'].end.column,
    fs.readFileSync(node.path, 'utf8').split('\n')[0].length,
  );
  assert.equal(file.toSummary().statements.pct, 100);
});

test('attributes Angular development replacements to their actual source without losing placeholder entries', () => {
  const root = fixture();
  const original = {
    ...coverage(root, [1, 1]),
    path: path.join(root, 'src/game/debug/inspector-loader.ts'),
  };
  const replacement = {
    ...coverage(root, [0, 0]),
    path: path.join(root, 'src/game/debug/inspector-loader.development.ts'),
  };
  const remapped = remapBrowserCoverage({ original, replacement }, root) as Record<
    string,
    FileCoverageData
  >;
  assert.equal(Object.keys(remapped).length, 2);
  assert.equal(remapped.original.path, replacement.path);
  assert.equal(remapped.replacement.path, replacement.path);
});

test('normalizes native separators, file URLs and relative paths and rejects escaping sources', () => {
  const root = fixture();
  const filename = path.join(root, 'src/example.ts');
  for (const source of [
    filename,
    filename.replaceAll('/', '\\'),
    pathToFileURL(filename).href,
    'src/example.ts',
  ])
    assert.equal(relativeSource(source, root), 'src/example.ts');
  assert.throws(() => relativeSource('../outside.ts', root), /outside the repository/);
});

test('keeps game, normal tooling, generated sources and opt-in laboratories in their intended scopes', () => {
  for (const file of ['src/simulation/simulation.ts', 'src/main.ts']) assert(inScope(file, 'game'));
  for (const file of [
    'src/scripts.ts',
    'src/scene-registrations.ts',
    'src/testing/setup-tests.ts',
    'src/game/testing/fixture.ts',
    'src/app/app.spec.ts',
    'src/session/game-session.test.ts',
    'src/simulation/physics/world-physics.test.ts',
    'src/contracts/example.d.ts',
  ])
    assert(!inScope(file, 'game'), file);
  for (const file of [
    'tools/scenes/export.ts',
    'tools/coverage/report.ts',
    'tools/testing/vitest-node.ts',
    'tools/ecs-bench/verify-production.ts',
    'eslint.config.ts',
  ])
    assert(inScope(file, 'tooling'), file);
  for (const file of [
    'tools/ecs-bench/cli.ts',
    'tools/simulation-worker-bench/cli.ts',
    'tools/editor-mcp/index.ts',
    'tools/art/contact-sheet-protagonist-runtime.ts',
    'tools/world/test-fixture.ts',
    'tools/testing/inline-game-session.ts',
    'tools/scenes/workflow.test.ts',
    'src/core/world-grid.ts',
  ])
    assert(!inScope(file, 'tooling'), file);
});

test('requires every contributing suite and rejects malformed or empty coverage instead of reporting success', () => {
  const root = fixture();
  assert.throws(() => generateReport('game', root), /game-node coverage/);
  const directory = path.join(root, 'coverage/raw/game-node');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'coverage-final.json'),
    JSON.stringify({ example: coverage(root, [1, 0]) }),
  );
  assert.throws(() => generateReport('game', root), /game-browser coverage/);
  for (const input of [
    {},
    [],
    { example: { path: 'src/example.ts' } },
    { example: { ...coverage(root, [1, 0]), s: { 0: -1 } } },
  ])
    assert.throws(() => mergeCoverage([input], 'game', root));
  assert.throws(
    () => mergeCoverage([{ example: coverage(root, [1, 0]) }], 'tooling', root),
    /no tooling sources/,
  );
});

test('cleans stale outputs and inputs for only the selected group', () => {
  const root = fixture();
  for (const directory of ['game', 'raw/game-node', 'raw/game-browser', 'tooling', 'raw/tooling']) {
    const target = path.join(root, 'coverage', directory);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'stale'), 'old');
  }
  writeSummary('old', root);
  cleanCoverage('game', root);
  for (const directory of ['game', 'raw/game-node', 'raw/game-browser', 'summary.md'])
    assert(!fs.existsSync(path.join(root, 'coverage', directory)));
  for (const directory of ['tooling', 'raw/tooling'])
    assert(fs.existsSync(path.join(root, 'coverage', directory, 'stale')));
});

test('generates usable HTML, LCOV and JSON reports and a separate Actions summary', () => {
  const root = fixture();
  for (const [source, hits] of [
    ['game-node', [1, 0]],
    ['game-browser', [0, 1]],
  ] as const) {
    const directory = path.join(root, 'coverage/raw', source);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'coverage-final.json'),
      JSON.stringify({ example: coverage(root, [...hits]) }),
    );
  }
  const summary = generateReport('game', root);
  const directory = path.join(root, 'coverage/game');
  for (const file of ['index.html', 'lcov.info', 'coverage-final.json', 'coverage-summary.json'])
    assert(fs.statSync(path.join(directory, file)).size > 0);
  assert.match(
    fs.readFileSync(path.join(directory, 'lcov.info'), 'utf8').replaceAll('\\', '/'),
    /SF:src\/example.ts/,
  );
  const table = summaryTable({ game: summary, tooling: summary });
  assert.match(table, /\| Game \| 100.00%/);
  assert.match(table, /\| Tooling \| 100.00%/);
  assert.match(table, /informational/);
  const actionsSummary = path.join(root, 'actions-summary.md');
  fs.writeFileSync(actionsSummary, 'Existing summary\n');
  writeSummary(table, root, actionsSummary);
  assert.equal(fs.readFileSync(path.join(root, 'coverage/summary.md'), 'utf8'), table);
  assert.equal(fs.readFileSync(actionsSummary, 'utf8'), 'Existing summary\n' + table);
});

test('uses the same V8 provider without thresholds and isolates each collection directory', () => {
  const configurations = (['game-node', 'game-browser', 'tooling'] as const).map(coverageOptions);
  assert.equal(new Set(configurations.map((config) => config.reportsDirectory)).size, 3);
  for (const config of configurations) {
    assert.equal(config.provider, 'v8');
    assert.equal(config.clean, true);
    assert.equal(config.reportOnFailure, false);
    assert(!('thresholds' in config));
  }
});
