import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudioPartnerStatus } from './studio-partner-status.js';

test('while generating, names the work and the wait instead of a silent spinner', () => {
  const status = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Building your preview…',
    elapsedSec: 8,
    hasPreview: false,
  });
  assert.match(status.now, /preview/i);
  assert.match(status.next, /Hang tight/);
  assert.match(status.next, /0:08/);
});

test('after a working preview, names the next business beat', () => {
  const status = resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    continueLabel: 'Add a payment gateway',
  });
  assert.match(status.now, /working preview/i);
  assert.match(status.next, /Add a payment gateway/);
});

test('errors stay honest and offer a retry, not fake success', () => {
  const status = resolveStudioPartnerStatus({
    lastAiIsError: true,
    lastAiText: 'failed',
  });
  assert.match(status.now, /did not finish/);
  assert.match(status.next, /Retry/);
});

test('empty studio has no partner strip', () => {
  assert.equal(resolveStudioPartnerStatus({}), null);
});
