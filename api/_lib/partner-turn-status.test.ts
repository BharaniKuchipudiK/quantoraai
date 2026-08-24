import assert from 'node:assert/strict';
import test from 'node:test';
import { partnerProviderPressureLabel } from './partner-turn-status.js';

test('overloaded failover names the next engine instead of silent retry', () => {
  const label = partnerProviderPressureLabel({
    attempt: 2,
    maxAttempts: 4,
    nextModelLabel: 'gemini-flash-latest',
    statusCode: 503,
  });
  assert.match(label, /overloaded/i);
  assert.match(label, /gemini-flash-latest/);
  assert.match(label, /2\/4/);
  assert.match(label, /different engine|switching/i);
});

test('non-overloaded failover still explains the switch', () => {
  const label = partnerProviderPressureLabel({
    attempt: 1,
    maxAttempts: 3,
    nextModelLabel: 'openrouter/auto',
    statusCode: 502,
  });
  assert.match(label, /switching to openrouter\/auto/i);
});
