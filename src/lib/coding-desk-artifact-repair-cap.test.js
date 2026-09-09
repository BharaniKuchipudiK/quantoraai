import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTurnRecovery } from './turn-recovery.js';

test('[was-red] build-contract repair runs once even when the turn budget funds more attempts', () => {
  const first = resolveTurnRecovery({
    attempt: 1,
    maxAttempts: 6,
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
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'the repaired reply still had no runnable page',
  });
  assert.equal(second.retry, false);
  assert.equal(second.reason, 'build-repair-exhausted');
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
