import { ESLint } from 'eslint';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { format, resolveConfig } from 'prettier';

const eslint = new ESLint();

it('applies Angular, TypeScript, access-modifier, and Prettier rules together', async () => {
  const [result] = await eslint.lintText(
    "import { Component } from '@angular/core'; const unused = 1; @Component({ selector: 'wrong-example', template: '' }) export class ExampleComponent{value=1}",
    { filePath: 'src/app/example.component.ts' },
  );
  const rules = new Set(result.messages.map((message) => message.ruleId));

  for (const rule of [
    '@angular-eslint/component-selector',
    '@typescript-eslint/no-unused-vars',
    'scrapworks/explicit-member-accessibility',
    'prettier/prettier',
  ]) {
    assert.ok(rules.has(rule), `${rule} should report a violation`);
  }
});

it('checks accessibility in external and inline Angular templates', async () => {
  const [external] = await eslint.lintText('<img src="example.png">', {
    filePath: 'src/app/example.component.html',
  });
  const [inline] = await eslint.lintText(
    "import { Component } from '@angular/core'; @Component({ selector: 'app-example', template: '<img src=\"example.png\">' }) export class ExampleComponent {}",
    { filePath: 'src/app/example.component.ts' },
  );

  for (const result of [external, inline]) {
    assert.ok(
      result.messages.some((message) => message.ruleId === '@angular-eslint/template/alt-text'),
    );
  }
});

it('ignores generated output for TypeScript and templates', async () => {
  assert.equal(await eslint.isPathIgnored('src/scripts.ts'), true);
  for (const directory of ['dist', '.angular', 'coverage']) {
    for (const extension of ['ts', 'html']) {
      assert.equal(await eslint.isPathIgnored(`${directory}/generated.${extension}`), true);
    }
  }
});

it('requires separation around TypeScript declarations and class methods', async () => {
  const [result] = await eslint.lintText(
    'export interface First { value: number; }\nexport interface Second { value: number; }\nexport class Example { public value = 1; public run() { return this.value; } public stop() {} }',
    { filePath: 'src/spacing-example.ts' },
  );
  const rules = new Set(result.messages.map((message) => message.ruleId));

  assert.ok(rules.has('@stylistic/padding-line-between-statements'));
  assert.ok(rules.has('@stylistic/lines-between-class-members'));
});

it('spaces declarations and documented methods while retaining compact field groups', async () => {
  const fixer = new ESLint({
    fix: true,
    overrideConfig: { rules: { '@typescript-eslint/no-unused-vars': 'off' } },
  });
  const filePath = 'src/spacing-example.ts';
  const input = [
    'interface First { value: number; }',
    'interface Second { value: number; }',
    'type Amount = number;',
    'const first = () => 1;',
    'const second = function () { return first(); };',
    'export function run() { return second(); }',
    'export class Example {',
    '  public value = 1;',
    '  private hidden = 2;',
    '  constructor(public readonly name: string) {}',
    '  /** Describe the completed action. */',
    '  public run() { return this.value + this.hidden; }',
    '  public stop() { return this.value; }',
    '}',
    '',
  ].join('\n');
  const [result] = await fixer.lintText(input, { filePath });
  assert.equal(result.errorCount, 0);
  assert.ok(result.output);
  assert.ok(result.output.includes('}\n\ninterface Second'));
  assert.ok(result.output.includes('}\n\ntype Amount'));
  assert.ok(result.output.includes('type Amount = number;\n\nconst first'));
  assert.ok(result.output.includes('const first = () => 1;\n\nconst second'));
  assert.ok(result.output.includes('public value = 1;\n  private hidden = 2;\n\n  constructor'));
  assert.ok(
    result.output.includes(
      'constructor(public readonly name: string) {}\n\n  /** Describe the completed action. */\n  public run',
    ),
  );
  assert.ok(result.output.includes('}\n\n  public stop'));

  // Formatting in the editor and fixing in CI must converge on the same layout.
  const formatted = await format(result.output, {
    ...(await resolveConfig(filePath)),
    filepath: filePath,
  });
  const [secondPass] = await fixer.lintText(formatted, { filePath });
  assert.equal(secondPass.errorCount, 0);
  assert.equal(secondPass.output, undefined);
});

it('allows grouped or separated single-line type aliases, including exports', async () => {
  const fixer = new ESLint({
    fix: true,
    overrideConfig: { rules: { '@typescript-eslint/no-unused-vars': 'off' } },
  });

  for (const separator of ['\n', '\n\n']) {
    for (const declaration of ['', 'export ']) {
      const input = `${declaration}type EntityId = string;${separator}${declaration}type Tick = number;\n`;
      const [result] = await fixer.lintText(input, { filePath: 'src/type-spacing-example.ts' });

      assert.equal(result.errorCount, 0);
      assert.equal(result.output, undefined);
    }
  }
});
