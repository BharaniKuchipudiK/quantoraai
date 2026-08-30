import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudioPartnerStatus, studioPreviewRunLabel, previewShellIsWarming } from './studio-partner-status.js';

/*
 * "Hang tight — it appears in Preview when it can run" was the same sentence at
 * 5 seconds and at 3 minutes, so a person could not tell a healthy turn from
 * one about to die. The wait is still named; it is now named with what is
 * ACTUALLY happening. Expectation updated deliberately, not loosened.
 */
test('while generating, names the work and the observed phase', () => {
  const status = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Building your preview…',
    elapsedSec: 8,
    hasPreview: false,
    activeModelName: 'Gemini 3 Flash',
  });
  assert.match(status.now, /preview/i);
  assert.match(status.next, /Reaching Gemini 3 Flash/);
  assert.match(status.next, /0:08/);
  assert.equal(status.stalled, false);
});

test('a turn with nothing coming back says so, and offers a way out', () => {
  const status = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Building your preview…',
    elapsedSec: 70,
    hasPreview: false,
    activeModelName: 'Nemotron 3 Super 120B',
    turnBudgetSec: 175,
  });
  assert.match(status.next, /No output from Nemotron 3 Super 120B after 1:10/);
  assert.equal(status.stalled, true);
  assert.ok(status.actions.length > 0, 'a stalled turn must offer something to DO');
});

test('Study gives staged learner-facing progress and names a slow tutor route', () => {
  const early = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Working on your next step…',
    elapsedSec: 8,
    studioDomain: 'education',
  });
  assert.match(early.now, /Shaping a clear tutor response/);
  assert.match(early.next, /as soon as it starts arriving/i);

  const slow = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Working on your next step…',
    elapsedSec: 105,
    studioDomain: 'education',
  });
  assert.match(slow.now, /taking longer than expected.*1:45/i);
  assert.match(slow.next, /stop and retry.*next eligible tutor route/i);
});

test('files being written are named as they land', () => {
  const status = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Building your preview…',
    elapsedSec: 40,
    hasPreview: false,
    streamedBytes: 129000,
    streamedPaths: ['index.html', 'products.json'],
  });
  assert.match(status.next, /Writing index\.html, products\.json/);
  assert.match(status.next, /126\.0 KB/);
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

test('the build clock counts past a minute', () => {
  /*
   * The minute was a literal zero, so the clock could not roll over: 110s
   * rendered as "0:110" and a full turn as "0:165". It stayed invisible while
   * every build died inside a minute. Now that the primary attempt gets 110s
   * and the turn 165s, this is on screen for the whole wait — so it is pinned
   * at the boundary and past both budgets.
   */
  const at = (elapsedSec) => resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Building your preview…',
    elapsedSec,
    hasPreview: false,
    // Bytes present so the line is a streaming phase rather than a stall
    // notice; the clock itself is what this test is about.
    streamedBytes: 2048,
  }).next.match(/\d+:\d\d/)?.[0];

  assert.equal(at(59), '0:59');
  assert.equal(at(60), '1:00', 'the minute must roll over, not stay literal');
  assert.equal(at(110), '1:50', 'the primary build attempt budget');
  assert.equal(at(165), '2:45', 'the full turn budget');
});
