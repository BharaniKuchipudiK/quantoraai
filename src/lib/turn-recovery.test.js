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
  assert.equal(resolveTurnRecovery({ attempt: MAX_TURN_ATTEMPTS, timedOut: true }).retry, false);
});

test('a half-written answer is never restarted under the reader', () => {
  const decision = resolveTurnRecovery({ attempt: 1, retryable: true, hasPartialText: true });
  assert.equal(decision.retry, false);
  assert.equal(decision.reason, 'partial-answer');
});

test('a chat-only build plan still rebuilds even after partial prose rendered', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    hasPartialText: true,
  });
  assert.equal(decision.retry, true);
  assert.equal(decision.reason, 'build-contract');
});

test('user stop remains terminal for the turn, but a step deadline auto-replans once', () => {
  assert.equal(resolveTurnRecovery({ attempt: 1, retryable: true, stoppedByUser: true }).retry, false);

  const timedOut = resolveTurnRecovery({
    attempt: 1,
    networkError: true,
    timedOut: true,
    fallbackEngineName: 'Gemini Flash',
    failureDetail: '175s step deadline',
  });
  assert.equal(timedOut.retry, true);
  assert.equal(timedOut.switchModel, true);
  assert.equal(timedOut.reason, 'step-deadline');
  assert.match(timedOut.retryBrief, /smaller independently useful runnable slice/i);
  assert.match(timedOut.notice, /Gemini Flash/);
});

test('a dropped connection retries once on a different engine when available', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    networkError: true,
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(decision.retry, true);
  assert.equal(decision.switchModel, true);
  assert.equal(decision.reason, 'network');
  assert.match(decision.notice, /Gemini Flash/);
});

test('travel flight provider failures auto-retry with a flight-specific notice', () => {
  const decision = resolveTurnRecovery({ attempt: 1, code: 'TRAVEL_FLIGHT_PROVIDER', retryable: true });
  assert.equal(decision.retry, true);
  assert.equal(decision.reason, 'travel-flight');
  assert.match(decision.notice, /flight/i);
});

test('a partial answer is resumable, not a dead end', () => {
  // It must not RESTART (that would duplicate what is already on screen) but it
  // must hand the caller a way to continue — the old behaviour did neither.
  const decision = resolveTurnRecovery({ attempt: 1, retryable: true, hasPartialText: true });
  assert.equal(decision.retry, false, 'never re-runs the whole turn');
  assert.equal(decision.resume, true, 'offers a continuation instead');
  assert.equal(decision.reason, 'partial-answer');
});

test('a failure with no partial text is not resumable', () => {
  const decision = resolveTurnRecovery({ attempt: 2, retryable: true, hasPartialText: false });
  assert.equal(decision.retry, false, 'attempts exhausted');
  assert.equal(decision.resume, false, 'nothing streamed, so nothing to continue');
});
