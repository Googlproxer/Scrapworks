import { ESLint } from 'eslint';
import assert from 'node:assert/strict';
import { it } from 'node:test';

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
  const [external] = await eslint.lintText('<img src="example.png">', { filePath: 'src/app/example.component.html' });
  const [inline] = await eslint.lintText(
    "import { Component } from '@angular/core'; @Component({ selector: 'app-example', template: '<img src=\"example.png\">' }) export class ExampleComponent {}",
    { filePath: 'src/app/example.component.ts' },
  );

  for (const result of [external, inline]) {
    assert.ok(result.messages.some((message) => message.ruleId === '@angular-eslint/template/alt-text'));
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
