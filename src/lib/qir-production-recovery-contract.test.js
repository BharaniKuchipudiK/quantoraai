import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveIsCodingRequest } from './build-intent.js';
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
