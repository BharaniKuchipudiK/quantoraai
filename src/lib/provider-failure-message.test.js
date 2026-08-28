import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANT: a failure names its status.
 *
 * Every provider failure used to read "The AI gateway could not complete the
 * request with X" — equally true of a dead key, an empty balance, an oversize
 * prompt, a rate limit and an upstream outage, and useful for none of them.
 * `status` was passed in and discarded, and the payload arrives as `{}`
 * whenever the error body is not JSON, so that generic line is what people
 * actually saw. Diagnosing one took a screenshot and an investigation while the
 * status code sat right there.
 *
 * A source assertion because the function is private to a React hook with no
 * seam to drive it from a test — the same tradeoff, deliberately taken, as the
 * other guards in this suite.
 */

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'useChatStream.js');
const source = () => readFileSync(HOOK, 'utf8');

test('the generic catch-all sentence is gone', () => {
  assert.doesNotMatch(
    source(),
    /The AI gateway could not complete the request with/,
    'a message that fits every failure explains none of them',
  );
});

test('every failure class the provider can return is named', () => {
  const text = source();
  const block = text.slice(text.indexOf('function responseErrorMessage'), text.indexOf('function activeStudioDomain'));
  for (const status of ['401', '402', '403', '404', '413', '429']) {
    assert.ok(block.includes(status), `HTTP ${status} needs its own explanation`);
  }
  assert.match(block, /status >= 500/, 'upstream failures are the provider, not the prompt');
});

test('the status reaches the reader in every branch', () => {
  const text = source();
  const block = text.slice(text.indexOf('function responseErrorMessage'), text.indexOf('function activeStudioDomain'));
  const returns = [...block.matchAll(/return `([^`]+)`/g)].map((m) => m[1]);
  assert.ok(returns.length >= 7, `expected a branch per failure class; found ${returns.length}`);
  for (const line of returns) {
    assert.match(line, /HTTP \$?\{?status\}?|HTTP \d{3}/, `no status in: ${line}`);
  }
});

test('a message the server actually sent still wins', () => {
  // A status code knows less than the server does. The specific message is
  // better whenever there is one.
  const text = source();
  const block = text.slice(text.indexOf('function responseErrorMessage'), text.indexOf('function activeStudioDomain'));
  assert.match(block, /if \(payload\?\.error\) return payload\.error;/);
});

test('a failure that retrying cannot fix says so', () => {
  const text = source();
  const block = text.slice(text.indexOf('function responseErrorMessage'), text.indexOf('function activeStudioDomain'));
  assert.match(block, /retrying will not clear it/, 'a credential failure is permanent until someone fixes it');
});
