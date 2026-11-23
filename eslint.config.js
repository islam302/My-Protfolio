import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'tests/.cache/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  // Browser code
  {
    files: ['apps/web/src/scripts/**/*.js', 'apps/admin/src/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Playwright specs run callbacks inside the page (page.evaluate / addInitScript)
  {
    files: ['tests/**/*.js', 'tools/screenshots/**/*.mjs', 'playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Server code gets the security plugin
  {
    files: ['apps/api/**/*.js', 'packages/**/*.js'],
    plugins: { security },
    rules: { ...security.configs.recommended.rules, 'security/detect-object-injection': 'off' },
  },
];
