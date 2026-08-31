import globals from 'globals';
import react from 'eslint-plugin-react';
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
 * - react/jsx-no-undef: no-undef reads plain identifiers, but eslint's core
 *   does not treat a JSX component name as a variable reference, so an
 *   undefined component passed this gate untouched. Measured, not assumed —
 *   `<ThisDoesNotExist size={14} />` was injected into a real component and
 *   eslint exited 0. That is the exact shape of a `Search` icon used without
 *   an import, which took the whole desk down and was caught only by loading
 *   the page in a browser. It also found a live one on its first run:
 *   ConversationInsightCard, declared inside LatencyTrendChart and rendered
 *   from TechnicalAnalyticsPanel, out of scope at the only place using it.
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
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021, React: 'readonly', JSX: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
