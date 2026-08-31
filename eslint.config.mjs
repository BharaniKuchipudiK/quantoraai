import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/*
 * Targeted lint: catch bugs a bundler build does not.
 *
 * - no-undef: an undefined identifier is a runtime ReferenceError, and
 *   `tsc --noEmit` doesn't check .jsx — which is how `useCallback is not
 *   defined` and `wcUrl is not defined` reached production and crashed the
 *   whole app.
 * - react-hooks/rules-of-hooks: a conditional hook corrupts React state at
 *   runtime with no build-time symptom — the frontend's largest components
 *   hold 70+ hooks each, exactly where these bugs hide.
 * - react-hooks/exhaustive-deps stays a warning: a stale closure is a real
 *   bug but existing code has intentional dependency omissions; warnings
 *   surface new ones without failing CI on the backlog.
 *
 * Deliberately NOT a full style ruleset — high-signal and low-noise only.
 * TypeScript files are covered by `npm run lint` (tsc).
 */
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['**/*.test.*'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021, React: 'readonly', JSX: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
