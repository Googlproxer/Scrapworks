import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createCoverageMap,
  createFileCoverage,
  type CoverageMap,
  type CoverageSummaryData,
  type FileCoverageData,
} from '@vitest/istanbul-lib-coverage';
import { create, createContext } from '@vitest/istanbul-lib-report';
import {
  browserReplacements,
  coverageExclude,
  gameInclude,
  projectRoot,
  toolingInclude,
} from './config.ts';
import { normalizeLocations } from './source-locations.ts';

export type Group = 'game' | 'tooling';
const sources = { game: ['game-node', 'game-browser'], tooling: ['tooling'] } as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fileData(value: unknown): FileCoverageData {
  if (!record(value) || typeof value.path !== 'string')
    throw new Error('Invalid file coverage: expected a source path');
  for (const field of ['statementMap', 'fnMap', 'branchMap', 's', 'f', 'b']) {
    if (!record(value[field])) throw new Error(`Invalid file coverage: missing ${field}`);
  }
  for (const field of ['s', 'f', 'b']) {
    const counts = Object.values(value[field] as Record<string, unknown>);
    const hits =
      field === 'b'
        ? counts.flatMap((count) => {
            if (!Array.isArray(count)) throw new Error('Invalid branch coverage counts');
            return count as unknown[];
          })
        : counts;
    if (hits.some((count) => typeof count !== 'number' || !Number.isFinite(count) || count < 0))
      throw new Error('Invalid coverage hit count');
  }
  const data = value as unknown as FileCoverageData;
  // Let Istanbul validate the location maps as well as the required fields.
  createFileCoverage(data).toSummary();
  return data;
}

export function relativeSource(filename: string, root = projectRoot): string {
  const source = filename.startsWith('file:') ? fileURLToPath(filename) : filename;
  const absolute = path.resolve(root, source.replaceAll('\\', '/'));
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative))
    throw new Error(`Coverage source is outside the repository: ${filename}`);
  return relative;
}

export function inScope(relative: string, group: Group): boolean {
  const include = group === 'game' ? gameInclude : toolingInclude;
  return (
    include.some((pattern) => path.matchesGlob(relative, pattern)) &&
    !coverageExclude.some((pattern) => path.matchesGlob(relative, pattern))
  );
}

export function mergeCoverage(inputs: unknown[], group: Group, root = projectRoot): CoverageMap {
  const result = createCoverageMap({});
  for (const input of inputs) {
    if (!record(input) || !Object.keys(input).length)
      throw new Error('Empty or invalid coverage map');
    let included = 0;
    for (const entry of Object.values(input)) {
      const data = fileData(entry);
      const relative = relativeSource(data.path, root);
      if (!inScope(relative, group)) continue;
      const canonical = fs.realpathSync(path.resolve(root, relative));
      if (!inScope(relativeSource(canonical, root), group))
        throw new Error(`Coverage source resolves outside its scope: ${data.path}`);
      result.addFileCoverage(normalizeLocations({ ...data, path: canonical }));
      included++;
    }
    if (!included) throw new Error(`Coverage input contains no ${group} sources`);
  }
  if (!result.files().length) throw new Error(`Missing ${group} coverage`);
  return result;
}

export function remapBrowserCoverage(input: unknown, root = projectRoot): unknown {
  if (!record(input)) throw new Error('Invalid browser coverage map');
  return Object.fromEntries(
    Object.entries(input).map(([id, value]) => {
      const data = fileData(value);
      const relative = relativeSource(data.path, root);
      // Angular's bundled sourcemaps identify replacements by the original file path.
      const replacement = browserReplacements.find((entry) => entry.replace === relative);
      return [id, replacement ? { ...data, path: path.join(root, replacement.with) } : data];
    }),
  );
}

function clearDirectory(directory: string, root: string) {
  const relative = path.relative(path.resolve(root, 'coverage'), path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`Refusing to clear an unexpected coverage directory: ${directory}`);
  fs.rmSync(directory, { recursive: true, force: true });
}

export function cleanCoverage(group: Group, root = projectRoot) {
  for (const source of sources[group])
    clearDirectory(path.join(root, 'coverage/raw', source), root);
  clearDirectory(path.join(root, 'coverage', group), root);
  fs.rmSync(path.join(root, 'coverage/summary.md'), { force: true });
}

export function generateReport(group: Group, root = projectRoot): CoverageSummaryData {
  const inputs = sources[group].map((source) => {
    const filename = path.join(root, 'coverage/raw', source, 'coverage-final.json');
    try {
      const input: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
      return source === 'game-browser' ? remapBrowserCoverage(input, root) : input;
    } catch (cause) {
      throw new Error(`Missing or invalid ${source} coverage; rerun its full coverage suite`, {
        cause,
      });
    }
  });
  const coverageMap = mergeCoverage(inputs, group, root);
  const directory = path.join(root, 'coverage', group);
  clearDirectory(directory, root);
  const context = createContext({ dir: directory, coverageMap });
  create('html').execute(context);
  create('lcovonly', { projectRoot: root }).execute(context);
  create('json').execute(context);
  create('json-summary').execute(context);
  return coverageMap.getCoverageSummary().toJSON();
}

export function summaryTable(results: Partial<Record<Group, CoverageSummaryData>>): string {
  const rows = [
    '## Test coverage',
    '',
    '| Report | Lines | Statements | Functions | Branches |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const group of ['game', 'tooling'] as const) {
    const result = results[group];
    if (!result) continue;
    const metrics = (['lines', 'statements', 'functions', 'branches'] as const).map((key) => {
      const metric = result[key];
      return `${typeof metric.pct === 'number' ? metric.pct.toFixed(2) + '%' : 'n/a'} (${metric.covered}/${metric.total})`;
    });
    rows.push(`| ${group === 'game' ? 'Game' : 'Tooling'} | ${metrics.join(' | ')} |`);
  }
  return rows.join('\n') + '\n\nCoverage is informational; no minimum thresholds are enforced.\n';
}

export function writeSummary(summary: string, root = projectRoot, actionsSummary?: string) {
  fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
  fs.writeFileSync(path.join(root, 'coverage/summary.md'), summary);
  if (actionsSummary) fs.appendFileSync(actionsSummary, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const cleaning = args[0] === 'clean';
  const selection = args[cleaning ? 1 : 0] ?? 'all';
  if (!['game', 'tooling', 'all'].includes(selection) || args.length > (cleaning ? 2 : 1))
    throw new Error('Usage: node tools/coverage/report.ts [clean] [game|tooling|all]');
  const groups: Group[] = selection === 'all' ? ['game', 'tooling'] : [selection as Group];
  if (cleaning) {
    for (const group of groups) cleanCoverage(group);
  } else {
    const results: Partial<Record<Group, CoverageSummaryData>> = {};
    for (const group of groups) results[group] = generateReport(group);
    const summary = summaryTable(results);
    console.log(summary);
    if (selection === 'all') writeSummary(summary, projectRoot, process.env.GITHUB_STEP_SUMMARY);
  }
}
