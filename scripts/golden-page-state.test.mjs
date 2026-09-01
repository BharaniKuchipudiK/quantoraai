import test from 'node:test';
import assert from 'node:assert/strict';
import { pageStateSnapshot, describePageState, textOf, PROBE_TIMEOUT_MS } from './lib/golden-page-state.mjs';

/*
 * A stub Playwright page. The snapshot's whole job is to survive a page that
 * is missing every hook it looks for, so the fixture is driven by what the
 * DOM does NOT have as much as by what it does.
 */
function stubPage({ hooks = {}, url = 'https://example.invalid/desk', explode = false } = {}) {
  const makeLocator = (selector) => {
    const entry = hooks[selector];
    const locator = {
      count: async () => {
        if (explode) throw new Error('locator exploded');
        return entry ? (entry.count ?? 1) : 0;
      },
      innerText: async () => {
        if (explode) throw new Error('locator exploded');
        if (!entry || entry.text === undefined) throw new Error('no element');
        return entry.text;
      },
      getAttribute: async (name) => {
        if (explode) throw new Error('locator exploded');
        return entry?.attrs?.[name] ?? null;
      },
    };
    locator.first = () => locator;
    locator.last = () => locator;
    return locator;
  };
  return { url: () => url, locator: makeLocator };
}

test('a page missing every hook produces a complete, null-filled snapshot', async () => {
  const snapshot = await pageStateSnapshot(stubPage(), []);
  assert.equal(snapshot.snapshotFailed, undefined);
  assert.equal(snapshot.url, 'https://example.invalid/desk');
  assert.equal(snapshot.assistantMessages, 0);
  assert.equal(snapshot.lastAssistantText, null);
  assert.equal(snapshot.previewMounted, false);
  assert.equal(snapshot.previewCompiling, false);
  assert.equal(snapshot.previewError, null);
  assert.deepEqual(snapshot.consoleErrors, []);
});

test('it reports the state that distinguishes a slow turn from a failed one', async () => {
  const snapshot = await pageStateSnapshot(stubPage({
    hooks: {
      '[data-quantora-assistant-prose]': { count: 2, text: '  I could not\n  reach the model.  ' },
      '[data-quantora-real-project-preview="true"]': {
        count: 1,
        attrs: { 'data-quantora-preview-error': 'compile failed', 'data-quantora-correlation-id': 'abc-123' },
      },
      '[data-quantora-preview-loading="true"]': { count: 1 },
    },
  }), ['boom']);

  assert.equal(snapshot.assistantMessages, 2);
  // Whitespace collapsed so the snapshot stays one readable log line.
  assert.equal(snapshot.lastAssistantText, 'I could not reach the model.');
  assert.equal(snapshot.previewMounted, true);
  assert.equal(snapshot.previewCompiling, true);
  assert.equal(snapshot.previewError, 'compile failed');
  assert.equal(snapshot.previewCorrelationId, 'abc-123');
  assert.deepEqual(snapshot.consoleErrors, ['boom']);
});

test('long assistant text is truncated rather than flooding the log', async () => {
  const snapshot = await pageStateSnapshot(stubPage({
    hooks: { '[data-quantora-assistant-prose]': { count: 1, text: 'x'.repeat(5_000) } },
  }));
  assert.equal(snapshot.lastAssistantText.length, 300);
});

test('only the last few console errors are carried', async () => {
  const errors = Array.from({ length: 12 }, (_, i) => `error-${i}`);
  const snapshot = await pageStateSnapshot(stubPage(), errors);
  assert.deepEqual(snapshot.consoleErrors, ['error-7', 'error-8', 'error-9', 'error-10', 'error-11']);
});

test('a snapshot can never throw — a broken diagnostic must not replace the real failure', async () => {
  /*
   * Two degradation paths, and neither is allowed to throw. Every individual
   * query is guarded, so a page whose locators all reject still yields a
   * usable snapshot with sentinel values rather than losing the real error.
   */
  const degraded = await pageStateSnapshot(stubPage({ explode: true }), ['boom']);
  assert.equal(degraded.snapshotFailed, undefined);
  assert.equal(degraded.assistantMessages, -1, 'a failed count reports -1, not a crash');
  assert.equal(degraded.lastAssistantText, null);
  assert.equal(degraded.previewMounted, false);
  assert.deepEqual(degraded.consoleErrors, ['boom'], 'console errors survive a dead DOM');

  // Only a page object that is not a page at all reaches the outer guard.
  const garbage = await pageStateSnapshot({}, []);
  assert.equal(typeof garbage.snapshotFailed, 'string');
});

test('describePageState always returns a serialisable single line', async () => {
  const line = await describePageState(stubPage(), []);
  assert.equal(typeof line, 'string');
  assert.doesNotMatch(line, /\n/);
  assert.equal(JSON.parse(line).previewMounted, false);

  const broken = await describePageState({}, []);
  assert.equal(typeof JSON.parse(broken).snapshotFailed, 'string');
});

test('textOf returns null for an empty or absent element, not an empty string', async () => {
  const blank = { innerText: async () => '   ' };
  assert.equal(await textOf(blank), null);
  const missing = { innerText: async () => { throw new Error('no element'); } };
  assert.equal(await textOf(missing), null);
});

test('every probe is bounded — Playwright would otherwise auto-wait 30s per missing hook', async () => {
  /*
   * This snapshot only ever runs after a wait has already expired, so its
   * hooks are usually absent. Unbounded innerText/getAttribute would turn a
   * diagnostic into a multi-minute stall and get it deleted. Pin the bound.
   */
  const seen = [];
  const locator = {
    count: async () => 0,
    innerText: async (options) => { seen.push(['innerText', options]); throw new Error('absent'); },
    getAttribute: async (_name, options) => { seen.push(['getAttribute', options]); return null; },
  };
  locator.first = () => locator;
  locator.last = () => locator;

  await pageStateSnapshot({ url: () => 'https://example.invalid/desk', locator: () => locator }, []);

  assert.ok(seen.length >= 4, `expected several bounded probes, saw ${seen.length}`);
  for (const [method, options] of seen) {
    assert.equal(typeof options?.timeout, 'number', `${method} was called without a timeout`);
    assert.ok(options.timeout <= 5_000, `${method} timeout ${options.timeout}ms is too slow for a post-failure probe`);
  }
  assert.ok(PROBE_TIMEOUT_MS > 0 && PROBE_TIMEOUT_MS <= 5_000);
});
