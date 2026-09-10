import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveTurnRecovery } from './turn-recovery.js';

test('[was-red] build-contract repair runs once even when the turn budget funds more attempts', () => {
  const first = resolveTurnRecovery({
    attempt: 1,
    maxAttempts: 6,
    artifactRepairCount: 0,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'the reply was a chat plan with no runnable files',
  });
  assert.equal(first.retry, true);
  assert.equal(first.switchModel, false);
  assert.equal(first.reason, 'build-contract');
  assert.match(first.retryBrief, /ONE automatic artifact repair/i);
  // The one repair must preserve requested files. HTML is a conditional
  // fallback for an unspecified web page, not a mandatory format override.
  const preservation = first.retryBrief.indexOf("Preserve the original request's language, runtime, framework, required filenames and project layout.");
  const webFallback = first.retryBrief.indexOf('Only for a web page request with no specified framework or file layout:');
  const htmlFallback = first.retryBrief.indexOf('Return EXACTLY one complete self-contained HTML document');
  assert.ok(preservation >= 0 && webFallback > preservation && htmlFallback > webFallback,
    'the repair must preserve explicit file contracts before offering a conditional HTML fallback');
  assert.match(first.retryBrief, /Do not replace a requested multi-file project or non-web deliverable with a webpage/);
  assert.match(first.retryBrief, /single ```html code fence/i);
  assert.match(first.retryBrief, /CSS-only/i);

  const second = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 6,
    artifactRepairCount: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'the repaired reply still had no runnable page',
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(second.retry, true, 'a fresh engine is a materially different recovery, not a repeated repair');
  assert.equal(second.switchModel, true);
  assert.equal(second.reason, 'build-contract-escalation');
  assert.match(second.notice, /Gemini Flash/);
  assert.match(second.retryBrief, /repair was already attempted/i);

  const noFreshEngine = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 6,
    artifactRepairCount: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
  });
  assert.equal(noFreshEngine.retry, false);
  assert.equal(noFreshEngine.reason, 'build-repair-exhausted');
});

test('[was-red] a transport attempt does not consume the one artifact repair when the caller owns explicit repair state', () => {
  const afterTransport = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 6,
    artifactRepairCount: 0,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'the first model that answered produced no runnable page',
  });
  assert.equal(afterTransport.retry, true);
  assert.equal(afterTransport.switchModel, false);
  assert.equal(afterTransport.reason, 'build-contract');

  const afterArtifactRepair = resolveTurnRecovery({
    attempt: 3,
    maxAttempts: 6,
    artifactRepairCount: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'the one repaired artifact still had no runnable page',
  });
  assert.equal(afterArtifactRepair.retry, false);
  assert.equal(afterArtifactRepair.reason, 'build-repair-exhausted');
});

test('[was-red] an unwired caller still cannot run repeated artifact repairs', () => {
  /*
   * useChatStream historically omitted artifactRepairCount. Because the
   * resolver defaulted that missing state to zero, every call looked like the
   * first repair and a dynamic six-attempt budget could re-run the behavioral
   * repair again and again. The resolver itself now fails closed when state is
   * omitted: attempt one may repair; later attempts may not.
   */
  const first = resolveTurnRecovery({
    attempt: 1,
    maxAttempts: 6,
    code: 'BUILD_ARTIFACT_CONTRACT',
  });
  const second = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 6,
    code: 'BUILD_ARTIFACT_CONTRACT',
  });
  const sixth = resolveTurnRecovery({
    attempt: 5,
    maxAttempts: 6,
    code: 'BUILD_ARTIFACT_CONTRACT',
  });

  assert.equal(first.retry, true);
  assert.equal(first.reason, 'build-contract');
  assert.equal(second.retry, false);
  assert.equal(second.reason, 'build-repair-exhausted');
  assert.equal(sixth.retry, false);
});

test('artifact repair cap does not remove transport failover', () => {
  const transport = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 6,
    status: 503,
    retryable: true,
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(transport.retry, true);
  assert.equal(transport.switchModel, true);
  assert.equal(transport.reason, 'route');
});

test('[was-red] Coding Desk is the sole artifact-repair owner and wires its repair counter', () => {
  const handler = readFileSync(new URL('../../api/_lib/chat-handler.ts', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');

  assert.doesNotMatch(handler, /htmlRecoveryTried|recoverHtmlPreview|PREVIEW_HTML_RECOVERY/,
    'the server must return a contract miss to Coding Desk, not secretly retry the same engine');
  assert.match(hook, /let artifactRepairCount = 0/);
  assert.match(hook, /artifactRepairCount,/,
    'the live caller must pass explicit per-turn repair state');
  assert.match(hook, /recovery\.reason === 'build-contract'\) artifactRepairCount \+= 1/,
    'only the one same-engine behavioral repair consumes the repair allowance');
  const markResponder = hook.indexOf('absorbServerEngines(completedServerEngineId ? [completedServerEngineId] : [])');
  const assessRecovery = hook.indexOf("code: 'BUILD_ARTIFACT_CONTRACT'", markResponder);
  assert.ok(markResponder >= 0 && assessRecovery > markResponder,
    'a client-rejected response must mark the real server engine as spent before choosing its fallback');
});
