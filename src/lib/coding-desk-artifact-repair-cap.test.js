import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('[was-red] a transport attempt does not consume the one artifact repair', () => {
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

test('chat loop wires the artifact repair count independently from attempt number', () => {
  const source = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(source, /let artifactRepairCount = 0;/);
  assert.match(source, /recovery\.reason === 'build-contract'\) artifactRepairCount \+= 1/);
  const passes = source.match(/\n\s+artifactRepairCount,\n/g) || [];
  assert.ok(passes.length >= 3, 'all build-relevant recovery decisions receive the dedicated count');
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
