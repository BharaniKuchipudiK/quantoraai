import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareToBaseline,
  exportedNames,
  findOrphanComponents,
  findOrphanExports,
  hasDefaultExport,
  importedModulePaths,
  isTestPath,
  orphanKey,
  stripNonCode,
} from './wiring-audit.js';

test('the real case: a tested function nothing calls', () => {
  /*
   * shared/build-intent.js as it actually stood. shouldStartGuidedBuild had
   * tests that passed every day while nothing called it, so the platform never
   * asked an intake question. detectBuildIntent, beside it, was wired.
   */
  const files = {
    'shared/build-intent.js': `
      export function shouldStartGuidedBuild() { return true; }
      export function detectBuildIntent() { return true; }`,
    'src/hooks/useChatStream.js': `
      import { detectBuildIntent } from '../../shared/build-intent.js';
      const isCoding = detectBuildIntent(text);`,
    'src/lib/build-intent.test.js': 'shouldStartGuidedBuild({}); detectBuildIntent("x");',
  };
  assert.deepEqual(findOrphanExports(files), [
    { name: 'shouldStartGuidedBuild', file: 'shared/build-intent.js' },
  ]);
});

test('wiring it clears the finding', () => {
  const files = {
    'shared/build-intent.js': 'export function shouldStartGuidedBuild() {}',
    'src/hooks/useChatStream.js': `
      import { shouldStartGuidedBuild } from '../../shared/build-intent.js';
      guidedBuild: shouldStartGuidedBuild({ text }),`,
    'src/lib/build-intent.test.js': 'shouldStartGuidedBuild({});',
  };
  assert.deepEqual(findOrphanExports(files), [], 'a called export is wired, full stop');
});

test('a helper used inside its own module is wired, not an orphan', () => {
  /*
   * The noise that would kill this gate. resolveAnchor is internal to
   * build-repair; flagging it would bury the one finding that matters, and a
   * gate people learn to ignore protects nothing.
   */
  const files = {
    'src/lib/build-repair.js': `
      export function resolveAnchor(t, ids) { return null; }
      export function repairAnchors(html) { return resolveAnchor(html, []); }`,
    'src/lib/proof-control-plane.js': `
      import { repairAnchors } from './build-repair.js';
      repairAnchors(html);`,
    'src/lib/build-repair.test.js': 'resolveAnchor("a", []); repairAnchors("<a>");',
  };
  assert.deepEqual(findOrphanExports(files), []);
});

test('untested dead code is not reported — nothing is claiming it works', () => {
  const files = {
    'src/lib/old.js': 'export function neverUsed() {}',
    'src/lib/other.test.js': 'somethingElse();',
  };
  assert.deepEqual(findOrphanExports(files), [],
    'the danger is a green tick over a dead wire, not the dead wire alone');
});

test('only source directories are audited', () => {
  const files = {
    'src/components/Widget.jsx': 'export function Widget() {}',
    'scripts/one-off.mjs': 'export function helper() {}',
    'src/lib/thing.test.js': 'Widget(); helper();',
  };
  assert.deepEqual(findOrphanExports(files), [],
    'components and scripts are entry points; nothing importing them is normal');
});

test('exported consts and classes count, not just functions', () => {
  const files = {
    'src/lib/limits.js': 'export const MAX_TRIES = 3;\nexport class Budget {}',
    'src/lib/limits.test.js': 'MAX_TRIES; new Budget();',
  };
  assert.deepEqual(
    findOrphanExports(files).map((o) => o.name).sort(),
    ['Budget', 'MAX_TRIES'],
  );
});

test('exportedNames reads each declaration form', () => {
  const source = `
    export function a() {}
    export async function b() {}
    export const c = 1;
    export class D {}
    function notExported() {}`;
  assert.deepEqual(exportedNames(source), ['a', 'b', 'c', 'D']);
});

test('test paths are recognised', () => {
  assert.equal(isTestPath('src/lib/a.test.js'), true);
  assert.equal(isTestPath('api/_lib/b.test.ts'), true);
  assert.equal(isTestPath('src/lib/latest.js'), false, 'a name ending in "test" is not a test file');
});

test('the ratchet fails on new orphans and welcomes fixed ones', () => {
  const baseline = ['src/lib/a.js::known'];
  const same = compareToBaseline([{ file: 'src/lib/a.js', name: 'known' }], baseline);
  assert.equal(same.ok, true, 'a pre-existing orphan does not block work');

  const worse = compareToBaseline(
    [{ file: 'src/lib/a.js', name: 'known' }, { file: 'src/lib/b.js', name: 'fresh' }],
    baseline,
  );
  assert.equal(worse.ok, false);
  assert.deepEqual(worse.added, ['src/lib/b.js::fresh']);

  const better = compareToBaseline([], baseline);
  assert.equal(better.ok, true, 'fixing one must never fail the build');
  assert.deepEqual(better.removed, ['src/lib/a.js::known']);
});

test('orphan identity is stable across runs', () => {
  assert.equal(orphanKey({ file: 'shared/x.js', name: 'y' }), 'shared/x.js::y');
});

/*
 * THE GATE'S OWN BUG, KEPT AS A TEST.
 *
 * Caught by running the gate against a real regression it then failed to
 * report: this module's docblock names shouldStartGuidedBuild while explaining
 * why it matters, and a bare word search read that prose as a caller. Fixing it
 * dropped the baseline from 54 to 44 — ten of the "known orphans" had only ever
 * been cleared by a mention in a comment.
 */
test('a name in a comment is not a caller', () => {
  const files = {
    'src/lib/thing.js': 'export function doTheThing() {}',
    'src/lib/reader.js': `
      // doTheThing is what we should call here one day.
      /* See doTheThing for the reasoning. */
      export function reader() { return 1; }`,
    'src/lib/thing.test.js': 'doTheThing();',
  };
  assert.deepEqual(findOrphanExports(files), [
    { name: 'doTheThing', file: 'src/lib/thing.js' },
  ], 'prose about a function is not a call to it');
});

test('a name inside a string is not a caller', () => {
  const files = {
    'src/lib/thing.js': 'export function doTheThing() {}',
    'src/lib/message.js': `
      export const HELP = 'Either call doTheThing or delete it.';
      export function used() { return HELP; }`,
    'src/lib/thing.test.js': 'doTheThing();',
    'src/lib/message.test.js': 'HELP; used();',
  };
  const names = findOrphanExports(files).map((o) => o.name);
  assert.ok(names.includes('doTheThing'), 'an error message about a function does not wire it');
});

test('stripNonCode leaves real code alone', () => {
  const source = `
    // call foo() here
    /* or bar() */
    const message = 'run baz()';
    const template = \`and qux()\`;
    realCall();`;
  const stripped = stripNonCode(source);
  assert.match(stripped, /realCall/);
  for (const hidden of ['foo', 'bar', 'baz', 'qux']) {
    assert.doesNotMatch(stripped, new RegExp(`\\b${hidden}\\b`), `${hidden} was not real code`);
  }
});

test('root config files are production code', () => {
  /*
   * vite.config.ts imports crossOriginHeadersForPath to set the COEP headers
   * Preview depends on. The gate could not see root config files, reported
   * vercel-headers as orphaned, and I very nearly deleted it during a sweep.
   * Typecheck caught that one; the next might not be typed.
   */
  const files = {
    'src/lib/headers.js': 'export function crossOriginHeadersForPath(p) { return {}; }',
    'vite.config.ts': "import { crossOriginHeadersForPath } from './src/lib/headers.js';\nexport default { headers: crossOriginHeadersForPath };",
    'src/lib/headers.test.js': 'crossOriginHeadersForPath("/");',
  };
  assert.deepEqual(findOrphanExports(files), [], 'a config file is a caller like any other');
});

/*
 * THE SECOND KIND OF ORPHAN: A COMPONENT NOTHING RENDERS.
 *
 * TravelTripBoard shipped as a finished trip board — live flight and hotel
 * search, its own error states — that AiStudio never imported. It was the only
 * caller of /api/travel-search, so that endpoint was unreachable from the
 * running product while every gate in the repository stayed green.
 */
test('the real case: a component nothing renders', () => {
  const files = {
    'src/components/TravelTripBoard.jsx': `
      export default function TravelTripBoard({ messages }) {
        return fetch('/api/travel-search');
      }`,
    'src/components/FinanceBoard.jsx': 'export default function FinanceBoard() {}',
    'src/components/AiStudio.jsx': `
      import FinanceBoard from './FinanceBoard.jsx';
      export default function AiStudio() { return <FinanceBoard />; }`,
    'src/App.jsx': "import AiStudio from './components/AiStudio.jsx';",
  };
  assert.deepEqual(findOrphanComponents(files), [
    { name: 'TravelTripBoard', file: 'src/components/TravelTripBoard.jsx' },
  ], 'the board beside it is rendered; this one is not');
});

test('a component is wired by path, whatever binding the importer chose', () => {
  const files = {
    'src/components/TravelTripBoard.jsx': 'export default function TravelTripBoard() {}',
    'src/components/AiStudio.jsx': "import TripPanel from './TravelTripBoard.jsx';\nTripPanel;",
  };
  assert.deepEqual(findOrphanComponents(files), [],
    'renaming the import does not un-render the component');
});

test('a lazily imported component is wired', () => {
  const files = {
    'src/components/StudyTutorWorkspace.jsx': 'export default function StudyTutorWorkspace() {}',
    'src/components/AiStudio.jsx': "const W = lazy(() => import('./StudyTutorWorkspace.jsx'));",
  };
  assert.deepEqual(findOrphanComponents(files), [],
    'a dynamic import is how half this studio renders');
});

test('an extensionless specifier still resolves', () => {
  const files = {
    'src/components/interactive/LiveBeatMaker.jsx': 'export default function LiveBeatMaker() {}',
    'src/components/AiStudio.jsx': "const B = lazy(() => import('./interactive/LiveBeatMaker'));",
  };
  assert.deepEqual(findOrphanComponents(files), []);
});

test('a component only its own test imports is still an orphan', () => {
  const files = {
    'src/components/DeadBoard.jsx': 'export default function DeadBoard() {}',
    'src/components/DeadBoard.test.jsx': "import DeadBoard from './DeadBoard.jsx';\nDeadBoard();",
  };
  assert.deepEqual(findOrphanComponents(files), [
    { name: 'DeadBoard', file: 'src/components/DeadBoard.jsx' },
  ], 'a green tick over a dead wire is the failure, not the absence of one');
});

test('a commented-out import does not count as rendering', () => {
  const files = {
    'src/components/DeadBoard.jsx': 'export default function DeadBoard() {}',
    'src/components/AiStudio.jsx': `
      // import DeadBoard from './DeadBoard.jsx';
      /* import DeadBoard from './DeadBoard.jsx'; */
      export default function AiStudio() {}`,
    'src/App.jsx': "import AiStudio from './components/AiStudio.jsx';",
  };
  assert.deepEqual(findOrphanComponents(files), [
    { name: 'DeadBoard', file: 'src/components/DeadBoard.jsx' },
  ], 'commenting out the render is exactly how a board becomes an orphan');
});

test('a file with no default export is not a component this audit judges', () => {
  const files = {
    'src/components/helpers.js': 'export function formatPrice() {}',
  };
  assert.deepEqual(findOrphanComponents(files), [],
    'named exports in components stay findOrphanExports business, and it skips them');
});

test('only src/components is judged this way', () => {
  const files = {
    'src/lib/thing.js': 'export default function thing() {}',
    'scripts/one-off.mjs': 'export default function helper() {}',
  };
  assert.deepEqual(findOrphanComponents(files), [],
    'a script is an entry point; nothing importing it is the normal case');
});

test('keepStrings keeps specifiers but still drops comments', () => {
  const source = "// import Ghost from './Ghost.jsx';\nimport Real from './Real.jsx';";
  const scanned = stripNonCode(source, { keepStrings: true });
  assert.match(scanned, /\.\/Real\.jsx/, 'a live specifier survives the scan');
  assert.doesNotMatch(scanned, /Ghost/, 'a commented-out one does not');
  assert.doesNotMatch(stripNonCode(source), /Real\.jsx/, 'the default mode is unchanged');
});

test('specifiers resolve across directories, and only to files that exist', () => {
  const known = new Set([
    'src/components/AiStudio.jsx',
    'src/components/panels/TripPanel.jsx',
    'src/lib/travel-board-brief.js',
  ]);
  const fromPanel = importedModulePaths(
    'src/components/panels/TripPanel.jsx',
    "import { deriveTravelBrief } from '../../lib/travel-board-brief.js';\nimport('../AiStudio.jsx');\nimport React from 'react';",
    known,
  );
  assert.deepEqual([...fromPanel].sort(), ['src/components/AiStudio.jsx', 'src/lib/travel-board-brief.js']);
  assert.equal(fromPanel.has('react'), false, 'a package is not a file in this repository');

  assert.deepEqual(
    [...importedModulePaths('src/components/AiStudio.jsx', "import X from './Missing.jsx';", known)],
    [],
    'a specifier pointing at nothing resolves to nothing',
  );
});

test('a default export named in a string is not a default export', () => {
  assert.equal(hasDefaultExport('export default function Board() {}'), true);
  assert.equal(hasDefaultExport('export { Board };'), false);
  assert.equal(hasDefaultExport("const help = 'write export default here';"), false);
});
