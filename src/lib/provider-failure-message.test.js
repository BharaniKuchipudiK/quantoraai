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
  //
  // This asserted the literal line `if (payload?.error) return payload.error;`
  // until spendHold was appended to it. The INVARIANT is that payload.error is
  // returned whenever it exists and is never traded for a status-derived guess
  // — that is what is asserted now. Pinning the syntax instead would have made
  // any correct edit look like a regression, which is how a guard stops being
  // read and starts being worked around.
  const text = source();
  const block = text.slice(text.indexOf('function responseErrorMessage'), text.indexOf('function activeStudioDomain'));
  assert.match(block, /if \(payload\?\.error\) return .*payload\.error/,
    'the server message must still be returned when there is one');
  const guessesAfterPayloadError = block
    .slice(block.indexOf('if (payload?.error) return'))
    .match(/return `\$\{who\}/);
  assert.ok(guessesAfterPayloadError, 'the status-derived branches must remain, below the server message');
  assert.doesNotMatch(block, /if \(payload\?\.error\)[^\n]*\bwho\b/,
    'a status guess must never be substituted for the message the server sent');
});

test('a failure that retrying cannot fix says so', () => {
  const text = source();
  const block = text.slice(text.indexOf('function responseErrorMessage'), text.indexOf('function activeStudioDomain'));
  assert.match(block, /retrying will not clear it/, 'a credential failure is permanent until someone fixes it');
});

/*
 * INVARIANT: the reason the premium rung was withheld reaches the reader.
 *
 * The server has computed spendHold since the paid-route gate was wired, and
 * responseErrorMessage returned payload.error and discarded it — so it reached
 * no user at all. Written by one side, read by neither: the class test:wiring
 * exists for, hiding inside a payload rather than an unimported module.
 *
 * It is the field that names a REJECTED OPENROUTER CREDENTIAL, which stops
 * free models as surely as paid ones. Without it a person reads "every route is
 * unhealthy" while the cause sits one key away in the same response body.
 */
test('the spend hold is carried to the reader, not dropped', () => {
  const block = source().slice(
    source().indexOf('function responseErrorMessage'),
    source().indexOf('function activeStudioDomain'),
  );
  assert.match(block, /payload\?\.spendHold/, 'the server sends spendHold; this function must read it');
  assert.match(
    block,
    /\$\{payload\.error\}\\n\\n\$\{spendHold\}/,
    'appended to the turn message, never substituted for it — both sentences are needed',
  );
});
