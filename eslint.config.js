import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  Map: 'readonly',
  Set: 'readonly',
};

const NODE_GLOBALS = {
  Buffer: 'readonly',
  __dirname: 'readonly',
  console: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.preview/**', 'src/render/assets.generated.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: {
      'arrow-body-style': ['error', 'as-needed'],
      curly: ['error', 'multi-line', 'consistent'],
      'dot-notation': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-lonely-if': 'error',
      'no-useless-concat': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'one-var': ['error', 'never'],
      'operator-assignment': ['error', 'always'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
      ],
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // The viewer is a plain browser script inlined into the generated HTML.
    files: ['src/viewer/**/*.js'],
    languageOptions: { sourceType: 'script', globals: BROWSER_GLOBALS },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },
  {
    files: [
      'scripts/**/*.{js,mjs}',
      'vscode-extension/scripts/**/*.{js,mjs}',
      'vscode-extension/test/**/*.{js,mjs}',
    ],
    languageOptions: { globals: NODE_GLOBALS },
  },
  prettier,
);
