import assert from 'node:assert/strict';
import test from 'node:test';
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
  assert.match(first.retryBrief, /EXACTLY one complete self-contained HTML document/i);
  assert.match(first.retryBrief, /single ```html code fence/i);
  assert.match(first.retryBrief, /CSS-only/i);

  const second = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 6,
    artifactRepairCount: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'the repaired reply still had no runnable page',
  });
  assert.equal(second.retry, false);
  assert.equal(second.reason, 'build-repair-exhausted');
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