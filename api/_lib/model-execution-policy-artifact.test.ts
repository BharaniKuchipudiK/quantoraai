import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldFallbackBeforeStreaming } from './model-execution-policy.js';

test('[was-red] build artifact failures are not misclassified as provider-route failures', () => {
  const artifactError = Object.assign(new Error('Generated build artifact failed execution contract.'), {
    status: 502,
    code: 'BUILD_ARTIFACT_CONTRACT',
    detailCode: 'browser-preview-missing',
  });

  assert.equal(
    shouldFallbackBeforeStreaming(artifactError, { currentGateway: 'gemini', nextGateway: 'openrouter' }),
    false,
    'a behavioral output miss must not burn a second provider route',
  );
});

test('a genuine 502 transport failure still falls back', () => {
  const routeError = Object.assign(new Error('provider unavailable'), { status: 502 });
  assert.equal(
    shouldFallbackBeforeStreaming(routeError, { currentGateway: 'gemini', nextGateway: 'openrouter' }),
    true,
  );
});
