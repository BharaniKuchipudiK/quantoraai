import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTurnFailure } from './turn-failure-sentence.js';

test('an opaque browser network error is replaced with something a person can act on', () => {
  for (const raw of ['Failed to fetch', 'fetch failed', 'NetworkError', 'Load failed', '']) {
    const result = describeTurnFailure({ kind: 'network', errorMessage: raw });
    assert.doesNotMatch(result.text, /failed to fetch/i, raw);
    assert.match(result.text, /connection dropped/i, raw);
    assert.match(result.text, /send the message again/i, raw);
  }
});

test('a specific error keeps its own words rather than being relabelled', () => {
  const result = describeTurnFailure({ kind: 'network', errorMessage: 'Upstream returned malformed SSE' });
  assert.match(result.text, /Upstream returned malformed SSE/);
});

test('every failure says the retry already happened, so nobody thinks it gave up on the first try', () => {
  for (const kind of ['network']) {
    assert.match(describeTurnFailure({ kind, errorMessage: 'x' }).text, /retried once/i);
    assert.match(describeTurnFailure({ kind, errorMessage: 'Failed to fetch' }).text, /retried once/i);
  }
});

test('a timeout names the limit and does not suggest simply resending the same prompt', () => {
  const result = describeTurnFailure({ kind: 'timeout', deadlineSec: 135 });
  assert.match(result.text, /135 seconds/);
  assert.match(result.text, /one part at a time/i);
  assert.match(result.text, /hit the same limit/i);
});

test('a timeout with no known deadline still produces a sentence, without an empty number', () => {
  const result = describeTurnFailure({ kind: 'timeout' });
  assert.doesNotMatch(result.text, /after\s+seconds/);
  assert.doesNotMatch(result.text, /NaN/);
  assert.match(result.text, /ran out of time/i);
});

test('stopping is not reported as an error the user should retry', () => {
  const result = describeTurnFailure({ kind: 'stopped' });
  assert.match(result.text, /Stopped/);
  assert.doesNotMatch(result.text, /retried once/i);
});

test('partial text is acknowledged so nobody thinks it was discarded', () => {
  assert.match(describeTurnFailure({ kind: 'timeout', partialText: true }).text, /kept above/i);
  assert.match(describeTurnFailure({ kind: 'network', errorMessage: 'Failed to fetch', partialText: true }).text, /kept above/i);
  assert.doesNotMatch(describeTurnFailure({ kind: 'timeout', partialText: false }).text, /kept above/i);
});

test('every kind produces non-empty text and never an absence', () => {
  for (const kind of ['stopped', 'timeout', 'network', 'something-unrecognised']) {
    const result = describeTurnFailure({ kind });
    assert.ok(result.text.trim().length > 40, kind);
    assert.equal(typeof result.isError, 'boolean', kind);
  }
});

test('junk input still yields a sentence rather than throwing', () => {
  assert.ok(describeTurnFailure().text.length > 0);
  assert.ok(describeTurnFailure({ errorMessage: null, deadlineSec: NaN }).text.length > 0);
});
