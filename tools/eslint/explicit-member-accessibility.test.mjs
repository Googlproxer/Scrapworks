import tsParser from '@typescript-eslint/parser';
import { ESLint, RuleTester } from 'eslint';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import rule from './explicit-member-accessibility.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: tsParser } });
const missing = { messageId: 'missingAccessibility' };

tester.run('explicit-member-accessibility', rule, {
  valid: [
    'class Example { public value = 1; private hidden = 2; protected shared = 3; }',
    'class Example { constructor() {} private run() {} protected get value() { return 1; } }',
    'class Example { constructor(public readonly name: string, private count: number, protected enabled: boolean) {} }',
    'class Example { public constructor() {} }',
    'class Example { private constructor() {} }',
    'class Example { protected constructor() {} }',
    'class Example { constructor(); constructor(name: string); constructor(name?: string) {} }',
    'class Example { #value = 1; #run() {} get #current() { return 1; } set #current(value: number) {} }',
    'class Example { static {} [key: string]: unknown; }',
    'interface Example { value: number; run(): void; } const object = { value: 1, run() {} };',
    'abstract class Example { protected abstract run(): void; public abstract value: number; }',
    'class Example { constructor(name: string) {} public run(value: number) {} }',
    'class Example { @Input() public value = 1; @Trace() private run() {} }',
  ],
  invalid: [
    {
      code: 'class Example { value = 1; run() {} }',
      output: 'class Example { public value = 1; public run() {} }',
      errors: [missing, missing],
    },
    {
      code: 'class Example { constructor(readonly name: string, count: number) {} }',
      output: 'class Example { constructor(public readonly name: string, count: number) {} }',
      errors: [missing],
    },
    {
      code: 'class Example { constructor(@Inject(TOKEN) readonly name: string = "test") {} }',
      output: 'class Example { constructor(@Inject(TOKEN) public readonly name: string = "test") {} }',
      errors: [missing],
    },
    {
      code: 'class Example { ["constructor"]() {} }',
      output: 'class Example { public ["constructor"]() {} }',
      errors: [missing],
    },
    {
      code: 'class Example { @First() @Second() /* keep */ readonly value = 1; @Trace() run() {} }',
      output: 'class Example { @First() @Second() /* keep */ public readonly value = 1; @Trace() public run() {} }',
      errors: [missing, missing],
    },
    {
      code: 'class Example { static readonly value = 1; async run() {} *items() {} }',
      output: 'class Example { public static readonly value = 1; public async run() {} public *items() {} }',
      errors: [missing, missing, missing],
    },
    {
      code: 'class Example { get value() { return 1; } set value(next: number) {} }',
      output: 'class Example { public get value() { return 1; } public set value(next: number) {} }',
      errors: [missing, missing],
    },
    {
      code: 'abstract class Example { abstract value: number; abstract run(): void; abstract get current(): number; }',
      output: 'abstract class Example { public abstract value: number; public abstract run(): void; public abstract get current(): number; }',
      errors: [missing, missing, missing],
    },
    {
      code: 'abstract class Example { accessor value = 1; abstract accessor other: number; }',
      output: 'abstract class Example { public accessor value = 1; public abstract accessor other: number; }',
      errors: [missing, missing],
    },
    {
      code: 'class Example extends Base { override run() {} declare value: number; optional?: number; assigned!: number; }',
      output: 'class Example extends Base { public override run() {} public declare value: number; public optional?: number; public assigned!: number; }',
      errors: [missing, missing, missing, missing],
    },
    {
      code: 'class Example { [Symbol.iterator]() {} [key] = 1; "named"() {} }',
      output: 'class Example { public [Symbol.iterator]() {} public [key] = 1; public "named"() {} }',
      errors: [missing, missing, missing],
    },
    {
      code: 'class Example { run(value: string): void; run(value: number): void; run(value: string | number) {} }',
      output: 'class Example { public run(value: string): void; public run(value: number): void; public run(value: string | number) {} }',
      errors: [missing, missing, missing],
    },
    {
      code: 'const Example = class { value = 1; };',
      output: 'const Example = class { public value = 1; };',
      errors: [missing],
    },
  ],
});

it('combines access modifiers with project Prettier settings and is stable on a second format', async () => {
  const eslint = new ESLint({ fix: true });
  const options = { filePath: 'src/formatting-example.ts' };
  const [result] = await eslint.lintText(
    'export class Example{constructor(readonly label:string){}value="test";private hidden=2;protected shared=3;#secret=4;run(){return this.value+this.hidden+this.shared+this.#secret}}',
    options,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(
    result.output,
    "export class Example {\n  constructor(public readonly label: string) {}\n  public value = 'test';\n  private hidden = 2;\n  protected shared = 3;\n  #secret = 4;\n  public run() {\n    return this.value + this.hidden + this.shared + this.#secret;\n  }\n}\n",
  );

  const [secondPass] = await eslint.lintText(result.output, options);
  assert.equal(secondPass.errorCount, 0);
  assert.equal(secondPass.output, undefined);
});
