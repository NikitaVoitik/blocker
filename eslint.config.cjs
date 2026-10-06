const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'playwright-report/**', 'test-results/**', 'validation-results/**', 'docs/**', 'site/**', 'tests/**'] },
  {
    files: ['{background,blocked,content,lib,offscreen,popup,report,setup}/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, chrome: 'readonly' } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }], 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' },
  },
  {
    files: ['background/**/*.js'],
    languageOptions: { globals: { ...Object.fromEntries(Object.keys(globals.browser).map(key => [key, 'off'])), ...globals.serviceworker, chrome: 'readonly' } },
  },
];
