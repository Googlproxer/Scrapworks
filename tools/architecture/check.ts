import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const failures: string[] = [];
for (const relative of (await fs.readdir(path.join(root, 'src'), { recursive: true })).filter(
  (file) =>
    file.endsWith('.ts') &&
    !/\.(?:spec|test)\.ts$/.test(file) &&
    !file.startsWith('testing' + path.sep),
)) {
  const filename = 'src/' + relative.replaceAll('\\', '/');
  const source = await fs.readFile(path.join(root, filename), 'utf8');
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const deterministic = /^src\/(?:core|contracts|simulation)\//.test(filename);
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        ts.isCallExpression(node.parent))
    ) {
      const imported = node.text;
      if (/tools\/(?:testing|game-bench|ecs-bench|simulation-worker-bench)/.test(imported))
        failures.push(`${filename}: laboratory import ${imported}`);
      if (
        deterministic &&
        /^(?:@angular|@babylonjs|babylonjs|rxjs|dexie|@app|@game|@session)/.test(imported)
      )
        failures.push(`${filename}: deterministic dependency ${imported}`);
    }
    if (
      deterministic &&
      ts.isIdentifier(node) &&
      [
        'document',
        'window',
        'Date',
        'performance',
        'setTimeout',
        'setInterval',
        'requestAnimationFrame',
        'localStorage',
        'indexedDB',
      ].includes(node.text)
    )
      failures.push(`${filename}: external time/environment ${node.text}`);
    ts.forEachChild(node, visit);
  };
  visit(file);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log('Deterministic boundaries and production source imports verified.');
