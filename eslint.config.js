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

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.preview/**', 'src/render/assets.generated.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: {
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
  prettier,
);
