import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TURN_ATTEMPTS, resolveTurnRecovery } from './turn-recovery.js';

test('a build-contract failure heals itself instead of asking the user to retry', () => {
  const decision = resolveTurnRecovery({ attempt: 1, code: 'BUILD_ARTIFACT_CONTRACT' });
  assert.equal(decision.retry, true);
  assert.equal(decision.reason, 'build-contract');
  assert.match(decision.notice, /Rebuilding once/);
});

test('the retryable flag the server streams is actually honored', () => {
  assert.equal(resolveTurnRecovery({ attempt: 1, retryable: true }).retry, true);
  assert.equal(resolveTurnRecovery({ attempt: 1, retryable: false }).retry, false);
});

test('transient gateway statuses retry, credential failures never do', () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(resolveTurnRecovery({ attempt: 1, status }).retry, true, `status ${status}`);
  }
  for (const status of [401, 402, 403]) {
    assert.equal(resolveTurnRecovery({ attempt: 1, status }).retry, false, `status ${status}`);
    assert.equal(resolveTurnRecovery({ attempt: 1, status }).reason, 'credentials');
  }
});

test('recovery is bounded, so a broken route cannot loop', () => {
  assert.equal(resolveTurnRecovery({ attempt: MAX_TURN_ATTEMPTS, retryable: true }).retry, false);
  assert.equal(resolveTurnRecovery({ attempt: MAX_TURN_ATTEMPTS, code: 'BUILD_ARTIFACT_CONTRACT' }).retry, false);
});

test('a half-written answer is never restarted under the reader', () => {
  const decision = resolveTurnRecovery({ attempt: 1, retryable: true, hasPartialText: true });
  assert.equal(decision.retry, false);
  assert.equal(decision.reason, 'partial-answer');
});

test('stopping and timing out stay the user\'s decision and the turn budget', () => {
  assert.equal(resolveTurnRecovery({ attempt: 1, retryable: true, stoppedByUser: true }).retry, false);
  assert.equal(resolveTurnRecovery({ attempt: 1, networkError: true, timedOut: true }).retry, false);
});

test('a dropped connection retries once', () => {
  const decision = resolveTurnRecovery({ attempt: 1, networkError: true });
  assert.equal(decision.retry, true);
  assert.equal(decision.reason, 'network');
});
