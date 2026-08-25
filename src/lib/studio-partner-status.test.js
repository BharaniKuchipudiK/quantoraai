import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudioPartnerStatus, studioPreviewRunLabel, previewShellIsWarming } from './studio-partner-status.js';

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

test('an Office preview does not invite Vercel publish', () => {
  const status = resolveStudioPartnerStatus({
    hasPreview: true,
    officeKind: 'powerpoint',
    lastAiText: 'Deck is ready',
    hasUserTurn: true,
  });
  assert.match(status.now, /Office file/i);
  assert.doesNotMatch(status.next, /publish/i);
});

test('idle coding desk stays quiet — no sticky photos-missing furniture', () => {
  assert.equal(resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    codingDeskOpen: true,
    photosMissing: true,
  }), null);
  assert.equal(resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    codingDeskOpen: true,
    shopUiMissing: true,
  }), null);
  assert.equal(resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    codingDeskOpen: true,
  }), null);
});

test('open desk with files still warming is transient progress, not finished', () => {
  const status = resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Fox & Wolf with 10 photos',
    codingDeskOpen: true,
    hasDeskFiles: true,
    previewRunStatus: 'warming',
  });
  assert.match(status.now, /Preview is starting/i);
  assert.match(status.next, /live page|Retry/i);
  assert.doesNotMatch(status.now, /Product photos are still missing/i);
});

test('canvas preview without coding desk stays quiet when idle', () => {
  assert.equal(resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    continueLabel: 'Add a payment gateway',
  }), null);
});

test('errors stay honest and offer a retry, not fake success', () => {
  const status = resolveStudioPartnerStatus({
    lastAiIsError: true,
    lastAiText: 'failed',
  });
  assert.match(status.now, /did not finish/);
  assert.match(status.next, /Retry/);
});

test('previewShellIsWarming only for live shell states', () => {
  assert.equal(previewShellIsWarming('warming'), true);
  assert.equal(previewShellIsWarming('running'), true);
  assert.equal(previewShellIsWarming('clean'), false);
  assert.equal(previewShellIsWarming({ kind: 'quality', passed: true }), false);
});

test('studioPreviewRunLabel maps shell states', () => {
  assert.equal(studioPreviewRunLabel('clean'), 'Preview is running');
  assert.equal(studioPreviewRunLabel('failed'), 'Preview is running with errors');
  assert.equal(studioPreviewRunLabel({ kind: 'quality', passed: true }), 'Preview is running');
});
