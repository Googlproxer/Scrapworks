import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import angular from 'angular-eslint';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import explicitMemberAccessibility from './tools/eslint/explicit-member-accessibility.ts';

// Prettier retains these blank lines; ESLint inserts them when declarations touch.
const spacedDeclarations = [
  'class',
  'function',
  'interface',
  'type',
  'enum',
  'export',
  {
    selector:
      'VariableDeclaration[declarations.0.init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]',
  },
];

const singleLineTypes = [
  'singleline-type',
  {
    selector: 'ExportNamedDeclaration[declaration.type="TSTypeAliasDeclaration"]',
    lineMode: 'singleline',
  },
];

export default defineConfig([
  { ignores: ['dist/**', '.angular/**', 'coverage/**', 'src/scripts.ts'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    plugins: {
      scrapworks: {
        rules: { 'explicit-member-accessibility': explicitMemberAccessibility },
      },
      prettier,
      '@stylistic': stylistic,
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'scrapworks/explicit-member-accessibility': 'error',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: spacedDeclarations },
        { blankLine: 'always', prev: spacedDeclarations, next: '*' },
        { blankLine: 'any', prev: singleLineTypes, next: singleLineTypes },
      ],
      '@stylistic/lines-between-class-members': [
        'error',
        {
          enforce: [
            { blankLine: 'always', prev: '*', next: 'method' },
            { blankLine: 'always', prev: 'method', next: '*' },
          ],
        },
        { exceptAfterOverload: true },
      ],
      // Running Prettier here makes Format Document apply both kinds of fixes.
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
]);
