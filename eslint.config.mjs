import globals from 'globals';

/*
 * Targeted lint: catch "X is not defined" (no-undef) in the frontend.
 *
 * A bundler build does NOT catch an undefined identifier (it's a runtime
 * ReferenceError), and `tsc --noEmit` doesn't check .jsx — which is how
 * `useCallback is not defined` and `wcUrl is not defined` reached production
 * and crashed the whole app. This gate runs in CI on every PR so that class of
 * bug can never ship again. Deliberately scoped to no-undef only (not a full
 * style ruleset) to stay high-signal and low-noise. TypeScript files are covered
 * by `npm run lint` (tsc).
 */
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['**/*.test.*'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021, React: 'readonly', JSX: 'readonly' },
    },
    rules: { 'no-undef': 'error' },
  },
];
