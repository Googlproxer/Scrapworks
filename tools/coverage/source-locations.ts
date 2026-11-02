import fs from 'node:fs';
import ts from 'typescript';
import type { FileCoverageData, Range } from '@vitest/istanbul-lib-coverage';

/** Align source ranges lowered differently by Angular/esbuild and Vite/Oxc. */
export function normalizeLocations(data: FileCoverageData): FileCoverageData {
  const text = fs.readFileSync(data.path, 'utf8');
  const lines = text.split(/\r?\n/);
  const source = ts.createSourceFile(data.path, text, ts.ScriptTarget.Latest, true);
  const declarations: { starts: string[]; range: Range; field: boolean }[] = [];
  const statementsByStart = new Map<string, Range>();
  const position = (offset: number) => {
    const { line, character } = source.getLineAndCharacterOfPosition(offset);
    return { line: line + 1, column: character };
  };
  const key = (offset: number) => {
    const point = position(offset);
    return `${point.line}:${point.column}`;
  };
  function visit(node: ts.Node) {
    if (ts.isStatement(node) || ts.isExpression(node) || ts.isVariableDeclaration(node)) {
      const start = node.getStart(source);
      // Prefer the outer source construct when lowering changes its end column.
      if (!statementsByStart.has(key(start)))
        statementsByStart.set(key(start), { start: position(start), end: position(node.end) });
    }
    if (ts.isPropertyDeclaration(node) && node.initializer) {
      declarations.push({
        starts: [
          node.getStart(source),
          node.name.getStart(source),
          node.initializer.getStart(source),
        ].map(key),
        range: { start: position(node.getStart(source)), end: position(node.end) },
        field: true,
      });
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const keyword = node
        .getChildren(source)
        .find((child) => child.kind === ts.SyntaxKind.ClassKeyword);
      if (keyword) {
        const start = keyword.getStart(source);
        declarations.push({
          starts: [Math.max(0, start - 1), start].map(key),
          range: { start: position(start), end: position(node.end) },
          field: false,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  function range(location: Range, kind: 'statement' | 'function' | 'branch'): Range {
    // V8 uses Infinity for line-only end columns; JSON serializes these as null.
    const normalized = {
      start: { ...location.start },
      end: {
        ...location.end,
        column:
          location.end.column == null || !Number.isFinite(location.end.column)
            ? (lines[location.end.line - 1]?.length ?? 0)
            : location.end.column,
      },
    };
    if (kind === 'branch') return normalized;
    const start = `${normalized.start.line}:${normalized.start.column}`;
    return (
      declarations.find(
        (declaration) =>
          (kind === 'statement' || !declaration.field) && declaration.starts.includes(start),
      )?.range ??
      (kind === 'statement' ? statementsByStart.get(start) : undefined) ??
      normalized
    );
  }

  const statementMap: FileCoverageData['statementMap'] = {};
  const s: FileCoverageData['s'] = {};
  const statements = new Map<string, string>();
  for (const [id, location] of Object.entries(data.statementMap)) {
    const normalized = range(location, 'statement');
    const key = JSON.stringify(normalized);
    const index = statements.get(key) ?? String(statements.size);
    statements.set(key, index);
    statementMap[index] = normalized;
    s[index] = Math.max(s[index] ?? 0, data.s[id]);
  }
  const fnMap = Object.fromEntries(
    Object.entries(data.fnMap).map(([id, entry]) => [
      id,
      {
        ...entry,
        decl: range(entry.decl, 'function'),
        loc: range(entry.loc, 'function'),
      },
    ]),
  );
  const branchMap = Object.fromEntries(
    Object.entries(data.branchMap).map(([id, entry]) => [
      id,
      {
        ...entry,
        loc: range(entry.loc, 'branch'),
        locations: entry.locations.map((location) => range(location, 'branch')),
      },
    ]),
  );
  const hasHits = [Object.values(data.s), Object.values(data.f), Object.values(data.b).flat()].some(
    (counts) => counts.some((count) => count > 0),
  );
  // Empty, differently lowered placeholder maps must not expand a measured file's denominator.
  return { ...data, statementMap, s, fnMap, branchMap, all: !hasHits };
}
