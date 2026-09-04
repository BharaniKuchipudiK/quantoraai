import test from 'node:test';
import assert from 'node:assert/strict';
import { promptPolishFailureMessage } from './prompt-polish-failure.js';

/*
 * The property that matters is not the wording — it is that NO failure route
 * produces silence. The button looked dead because seven different answers all
 * rendered as nothing.
 */
test('every failure /api/enhance can return produces something to read', () => {
  for (const status of [400, 401, 403, 405, 413, 429, 500, 503, 0]) {
    const message = promptPolishFailureMessage({ status, payload: { error: 'Too many requests. Please wait a minute.' } });
    assert.ok(message && message.trim().length > 0, `HTTP ${status} produced no message`);
    assert.ok(!/undefined|null|\[object/.test(message), `HTTP ${status} leaked a placeholder: ${message}`);
  }
});

test('the statuses a user can act on say what to do, not just what broke', () => {
  assert.match(promptPolishFailureMessage({ status: 401 }), /sign in/i);
  assert.match(promptPolishFailureMessage({ status: 429 }), /wait/i);
  assert.match(promptPolishFailureMessage({ status: 413 }), /shorten/i);
  assert.match(promptPolishFailureMessage({ status: 503 }), /not configured/i);
});

test('a network error is distinguished from a refusal', () => {
  const message = promptPolishFailureMessage({ networkError: new Error('Failed to fetch') });
  assert.match(message, /could not reach/i);
  assert.match(message, /Failed to fetch/);
  assert.match(message, /unchanged/i, 'the user must know their draft survived');
});

test('an unknown status still names itself rather than sending anyone to the console', () => {
  const message = promptPolishFailureMessage({ status: 418, payload: null });
  assert.match(message, /418/, 'a message with no detail and no status is the silence this replaces');
});

test('the server keeps the floor when it explains itself', () => {
  const message = promptPolishFailureMessage({ status: 503, payload: { error: 'GEMINI_API_KEY is not configured on the server or Supabase API Gateway.' } });
  assert.match(message, /GEMINI_API_KEY/, 'the server knows more than the status code does');
  assert.match(message, /cannot run here/, 'and we still say what it means for the user');
});

test('an absurd server body cannot become the whole message', () => {
  const message = promptPolishFailureMessage({ status: 500, payload: { error: 'x'.repeat(5000) } });
  assert.ok(message.length < 200, `a 5000-character server error must not be pasted into the composer, got ${message.length}`);
});
