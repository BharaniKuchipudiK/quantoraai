import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/*
 * Targeted lint: catch the frontend mistakes that are a runtime crash, not a
 * style opinion.
 *
 * A bundler build does NOT catch an undefined identifier (it's a runtime
 * ReferenceError), and `tsc --noEmit` doesn't check .jsx — which is how
 * `useCallback is not defined` and `wcUrl is not defined` reached production
 * and crashed the whole app. This gate runs in CI on every PR so that class of
 * bug can never ship again. Deliberately scoped to crash-class rules only (not
 * a full style ruleset) to stay high-signal and low-noise. TypeScript files are
 * covered by `npm run lint` (tsc).
 *
 * WHY THREE RULES AND NOT ONE
 *
 * `no-undef` alone left the hole it was written to close. It reads plain
 * identifiers, but eslint's core does not treat a JSX component name as a
 * variable reference, so `<Search size={14} />` with no import passed this gate
 * and threw at runtime — measured, not assumed: an undefined component was
 * injected into a real file and eslint exited 0. `react/jsx-no-undef` reads the
 * half `no-undef` cannot see.
 *
 * `react-hooks/rules-of-hooks` covers the other crash this codebase has hit: a
 * `useEffect` placed after an early return changes the hook count between
 * renders and takes the whole workspace down with it. Both of those shipped and
 * were caught only by loading the page in a browser.
 *
 * These are cheap — eslint already runs on every PR, and the added rules cost
 * milliseconds — which is the point. The browser gates are the expensive net;
 * anything they catch that a linter could have is a wasted CI cycle.
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
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
