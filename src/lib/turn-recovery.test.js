import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TURN_ATTEMPTS, resolveTurnRecovery, resolveBudgetedTurnRecovery } from './turn-recovery.js';
import { planTurnEscalation } from './turn-escalation.js';

test('recovery uses the remaining budget after failure, never the budget at attempt start', () => {
  const failure = { attempt: 2, retryable: true, code: 'INFERENCE_ATTEMPT_TIMEOUT' };
  const before = planTurnEscalation({ elapsedMs: 23000, turnDeadlineMs: 175000, engineCount: 5 });
  const after = planTurnEscalation({ elapsedMs: 176000, turnDeadlineMs: 175000, engineCount: 5 });
  assert.equal(resolveBudgetedTurnRecovery(failure, before).retry, true);
  assert.equal(resolveBudgetedTurnRecovery(failure, after).retry, false);
});

test('a build-contract failure heals itself instead of asking the user to retry', () => {
  const decision = resolveTurnRecovery({ attempt: 1, code: 'BUILD_ARTIFACT_CONTRACT' });
  assert.equal(decision.retry, true);
  assert.equal(decision.reason, 'build-contract');
  assert.match(decision.notice, /Repairing once while preserving the requested format/);
  assert.doesNotMatch(decision.notice, /Rebuilding once as a self-contained page/);
});

test('[was-red] forbidden Preview storage gets a diagnosis-specific repair', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'Generated files failed Preview (opaque-storage-access).',
  });
  assert.equal(decision.retry, true);
  assert.match(decision.retryBrief, /localStorage/i);
  assert.match(decision.retryBrief, /in-memory/i);
  assert.match(decision.retryBrief, /cannot survive a refresh/i);
});

test('repair of an existing project never asks for a wholesale page replacement', () => {
  const decision = resolveTurnRecovery({ attempt: 1, code: 'BUILD_ARTIFACT_CONTRACT', hasExistingProject: true, failureDetail: 'patch did not match' });
  assert.equal(decision.retry, true);
  assert.match(decision.retryBrief, /patch did not match/);
  assert.match(decision.retryBrief, /Preserve unrelated files/);
  assert.doesNotMatch(decision.retryBrief, /Return EXACTLY one complete self-contained HTML/);
});

test('the retryable flag the server streams is actually honored', () => {
  assert.equal(resolveTurnRecovery({ attempt: 1, retryable: true }).retry, true);
  assert.equal(resolveTurnRecovery({ attempt: 1, retryable: false }).retry, false);
});

test('transient gateway statuses retry, credential failures and refusals never do', () => {
  /*
   * 429 was in the first list until 2026-09-08, and this test asserted it —
   * so the contract was wrong here before the code was. A rate-limit refusal
   * is not a transient gateway fault: it is Quantora declining, and retrying
   * it walks the engine ladder spending the very budget it waits on (eight
   * requests for one message, in a pilot user's Network tab). See the
   * REFUSED_STATUS note in turn-recovery.js and the storm tests in
   * turn-heal-contract.test.js.
   */
  for (const status of [408, 425, 500, 502, 503, 504]) {
    assert.equal(resolveTurnRecovery({ attempt: 1, status }).retry, true, `status ${status}`);
  }
  for (const status of [401, 402, 403]) {
    assert.equal(resolveTurnRecovery({ attempt: 1, status }).retry, false, `status ${status}`);
    assert.equal(resolveTurnRecovery({ attempt: 1, status }).reason, 'credentials');
  }
  assert.equal(resolveTurnRecovery({ attempt: 1, status: 429 }).retry, false, 'a refusal is never retried');
  assert.equal(resolveTurnRecovery({ attempt: 1, status: 429 }).reason, 'rate-limited');
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
  assert.match(timedOut.retryBrief, /smallest independently useful runnable slice/i);
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
