import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { codingFailureSpineOwnsTurn, resolveIsCodingRequest } from './build-intent.js';
import { resolveTurnRecovery } from './turn-recovery.js';

/*
 * Two production screenshots define this gate:
 * 1) Study "Make a few flashcards for Newton's laws" leaked Coding Preview /
 *    catalog-photo recovery after route exhaustion.
 * 2) A normal boutique revision hit the step deadline and made the user tap
 *    "Retry a smaller build".
 *
 * Keep the assertions at the ownership seams, not on cosmetic copy.
 */
test('[was-red] Study learning activity never enters Coding recovery ownership', () => {
  assert.equal(resolveIsCodingRequest("Make a few flashcards for Newton's laws", {
    codingDeskOpen: false,
  }), false);
  assert.equal(codingFailureSpineOwnsTurn({
    isCodingRequest: true,
    studioDomain: 'education',
  }), false, 'classifier misfire must still not give Study the Preview spine');
});

test('[was-red] a Coding step deadline selects a materially different automatic recovery', () => {
  const recovery = resolveTurnRecovery({
    attempt: 1,
    timedOut: true,
    fallbackEngineName: 'Gemini Flash',
    failureDetail: '175s step deadline',
  });
  assert.equal(recovery.retry, true);
  assert.equal(recovery.switchModel, true);
  assert.equal(recovery.reason, 'step-deadline');
  assert.match(recovery.retryBrief, /same user goal/i);
  assert.match(recovery.retryBrief, /smallest independently useful runnable slice/i);
});

test('QIR exposes pre-artifact model attempt and durable model failure seams', () => {
  const core = fs.readFileSync(new URL('./qir-coding-run-core.js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../../api/qir-runs.ts', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../hooks/useQirCodingRun.js', import.meta.url), 'utf8');

  assert.match(core, /beginModelAttempt/);
  assert.match(core, /reportModelFailure/);
  assert.match(core, /action: 'coding\.attempt'/);
  assert.match(api, /coding\.model_attempt_started/);
  assert.match(api, /preArtifactExecution/);
  assert.match(hook, /beginModelAttempt/);
  assert.match(hook, /reportModelFailure/);
});

test('[was-red] shared chat path journals Coding attempts and never lets Study own Preview recovery', () => {
  const stream = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const studio = fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  const intent = fs.readFileSync(new URL('../../shared/build-intent.js', import.meta.url), 'utf8');

  assert.match(intent, /codingFailureSpineOwnsTurn/);
  assert.match(stream, /codingFailureSpineOwnsTurn/);
  assert.match(stream, /notifyCodingAttempt/);
  assert.match(stream, /notifyCodingFailure/);
  assert.match(stream, /onCodingModelAttempt/);
  assert.match(stream, /onCodingModelFailure/);
  assert.match(studio, /onCodingModelAttempt/);
  assert.match(studio, /beginModelAttempt/);
  assert.match(studio, /reportModelFailure/);
  /*
   * The leak was a bare `if (isCodingRequest)` around resolveCodingTurnOutcome.
   * Advisor rooms must pass the second ownership gate before that copy can render.
   */
  assert.match(stream, /if \(codingSpineOwns\) \{/);
  assert.doesNotMatch(
    stream,
    /if \(isCodingRequest\) \{\s*[\s\S]{0,180}resolveCodingTurnOutcome/,
  );
});
