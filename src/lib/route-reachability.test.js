/**
 * A served route that nothing calls must be findable.
 *
 * THE INCIDENT. The QIR Resource Governor and Context Manager shipped complete —
 * typed, tested, deployed, each with its own HTTP route — and nothing in the
 * product ever called either. Every gate stayed green for weeks. What found them
 * was a person reading every route by hand during the Phase 0 re-audit.
 *
 * `test:dead-controls` checks one direction (every /api/ path the frontend calls
 * is served) and is structurally blind to the reverse. `test:wiring` ratchets
 * orphaned exports and components; an HTTP route is neither.
 *
 * WHAT THIS FILE IS REALLY FOR. Writing the gate produced FOUR false clean runs
 * in a row, each one passing over routes known to be uncalled:
 *
 *   1. docs/ was scanned, and the re-audit MENTIONS /api/qir-resources while
 *      describing it as unreachable.
 *   2. qir-durability.test.js reads '../../api/qir-resources.ts', and the path
 *      scan counted a module specifier as a call.
 *   3. test files counted as product callers.
 *   4. the baseline itself lives under src/, is .json, and lists the very routes
 *      it records — so every entry vouched for itself.
 *
 * Any one of those would have shipped a gate that could not fail (§4). Each was
 * caught by reading the output instead of the exit code. These cases pin all
 * four so the next edit cannot quietly restore one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareRoutesToBaseline,
  referencedApiPaths,
  routePathsFrom,
  unreachableRoutes,
} from './route-reachability.js';

test('only deployed function files count as routes', () => {
  const paths = routePathsFrom([
    'chat.ts', 'qir-runs.ts', 'pipeline.js', '_lib', '_middleware.ts',
    'chat.test.ts', 'types.d.ts', 'README.md',
  ]);
  assert.deepEqual(paths, ['/api/chat', '/api/pipeline', '/api/qir-runs']);
});

test('[was-red] a module specifier is not a caller', () => {
  /*
   * False clean #2. A contract test that READS a route file is not a client of
   * it — and this is exactly how the gate first reported /api/qir-resources,
   * the route it was written to find, as reachable.
   */
  const referenced = referencedApiPaths([
    "import x from '../../api/qir-resources.ts';",
    "readFileSync(new URL('../../api/qir-context.ts', import.meta.url))",
    "const p = 'docs/api/qir-runs.md';",
  ]);
  assert.equal(referenced.size, 0, `no call sites here, got: ${[...referenced].join(', ')}`);
});

test('a real fetch IS a caller, in every shape the product writes it', () => {
  const referenced = referencedApiPaths([
    "await fetch('/api/qir-runs', { method: 'POST' })",
    'await fetch(`/api/preview-image?u=${encodeURIComponent(href)}`)',
    'const ENDPOINT = "/api/deploy-gcp";',
  ]);
  assert.ok(referenced.has('/api/qir-runs'));
  assert.ok(referenced.has('/api/preview-image'));
  assert.ok(referenced.has('/api/deploy-gcp'));
});

test('[was-red] a longer route name does not vouch for a shorter one', () => {
  /*
   * `/api/deploy` and `/api/deploy-gcp` are different functions, and both were
   * dead in production on 2026-08-31 while CI reported success. A prefix match
   * would have let one hide the other.
   */
  const unreachable = unreachableRoutes({
    routePaths: ['/api/deploy', '/api/deploy-gcp'],
    referenced: referencedApiPaths(["fetch('/api/deploy-gcp')"]),
  });
  assert.deepEqual(unreachable, ['/api/deploy'], '/api/deploy has no caller of its own');
});

test('a route reached only through a rewrite is reachable', () => {
  /*
   * Not exercised by the repository today — /api/pipeline is also called
   * directly — so this is the only place the branch is driven. Without it, the
   * first route to be reached solely by its friendly path would be reported
   * dead, and 47 rewrites point at pipeline alone.
   */
  const unreachable = unreachableRoutes({
    routePaths: ['/api/pipeline'],
    referenced: referencedApiPaths(["fetch('/api/github/list-repos')"]),
    rewrites: [{ source: '/api/github/list-repos', destination: '/api/pipeline?github=list-repos' }],
  });
  assert.deepEqual(unreachable, [], 'the rewrite source is called, so its destination is reached');
});

test('a rewrite whose source nobody calls does not launder the destination', () => {
  const unreachable = unreachableRoutes({
    routePaths: ['/api/pipeline'],
    referenced: new Set(),
    rewrites: [{ source: '/api/github/list-repos', destination: '/api/pipeline' }],
  });
  assert.deepEqual(unreachable, ['/api/pipeline'], 'an uncalled rewrite proves nothing');
});

test('the ratchet reports what is new and what got wired', () => {
  const baseline = { '/api/qir-resources': 'governor, not yet wired' };

  const clean = compareRoutesToBaseline(['/api/qir-resources'], baseline);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.added, []);
  assert.deepEqual(clean.wired, []);

  const regressed = compareRoutesToBaseline(['/api/qir-resources', '/api/brand-new'], baseline);
  assert.equal(regressed.ok, false);
  assert.deepEqual(regressed.added, ['/api/brand-new'], 'a newly dead route must be named');

  /*
   * The direction that matters for #1: when the governor is finally wired, the
   * gate says so and asks for a smaller baseline. A ratchet that only tightens
   * silently never tells you the work landed.
   */
  const improved = compareRoutesToBaseline([], baseline);
  assert.equal(improved.ok, true);
  assert.deepEqual(improved.wired, ['/api/qir-resources']);
});
