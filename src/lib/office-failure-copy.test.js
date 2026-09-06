import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICE_FAILURE_DETAIL_LIMIT, officeFailureMessage } from './office-failure-copy.js';

test('the failure copy carries the stage and the detail the generator answered with', () => {
  const message = officeFailureMessage({
    error: 'Gatekeeper failed to produce a valid word specification after 1 attempts.',
    stage: 'provider',
    detail: 'anthropic: Anthropic HTTP 401 — gemini, openrouter not asked: one failover per attempt is the limit',
  });
  assert.equal(
    message,
    'Gatekeeper failed to produce a valid word specification after 1 attempts. (provider: anthropic: Anthropic HTTP 401 — gemini, openrouter not asked: one failover per attempt is the limit)',
  );
});

test('an answer with no detail reads as it always did, and no answer at all falls back', () => {
  assert.equal(officeFailureMessage({ error: 'Too many Office requests. Please wait a minute and try again.' }), 'Too many Office requests. Please wait a minute and try again.');
  assert.equal(officeFailureMessage({ error: 'Something failed', stage: 'parse' }), 'Something failed');
  assert.equal(officeFailureMessage(null), 'Compilation failed');
  assert.equal(officeFailureMessage({}, { fallback: 'The generator gave no answer' }), 'The generator gave no answer');
});

test('a long detail is bounded so the chat stays readable, and whitespace is collapsed', () => {
  const detail = `gemini: ${'x'.repeat(600)}`;
  const message = officeFailureMessage({ error: 'E', stage: 'semantic-gate', detail: `  ${detail}\n\n` });
  assert.ok(message.startsWith('E (semantic-gate: gemini: '));
  assert.ok(message.endsWith('…)'));
  assert.ok(message.length <= 'E (semantic-gate: '.length + OFFICE_FAILURE_DETAIL_LIMIT + 1);
  assert.equal(officeFailureMessage({ error: 'E', detail: 'a\n  b\tc' }), 'E (a b c)');
});
