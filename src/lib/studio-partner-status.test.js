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
    streamedBytes: 0,
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
    streamedBytes: 0,
    turnBudgetSec: 175,
  });
  assert.match(status.next, /No output from Nemotron 3 Super 120B after 1:10/);
  assert.equal(status.stalled, true);
  assert.ok(status.actions.length > 0, 'a stalled turn must offer something to DO');
});

test('Study distinguishes first-content wait from an answer that is already streaming', () => {
  const early = resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Working on your next step…',
    elapsedSec: 8,
    studioDomain: 'education',
    streamedBytes: 0,
  });
  assert.match(early.now, /Waiting for the tutor to start responding.*0:08/i);
  assert.match(early.next, /first content arrives/i);
  assert.equal(early.phase, 'waiting-first-content');
  assert.equal(early.stalled, false);

  const streaming = resolveStudioPartnerStatus({
    isGenerating: true,
    elapsedSec: 18,
    studioDomain: 'education',
    streamedBytes: 2048,
  });
  assert.match(streaming.now, /answer is arriving.*0:18/i);
  assert.match(streaming.next, /start reading now/i);
  assert.equal(streaming.phase, 'streaming');
  assert.equal(streaming.stalled, false);

  const slow = resolveStudioPartnerStatus({
    isGenerating: true,
    elapsedSec: 105,
    studioDomain: 'education',
    streamedBytes: 0,
  });
  assert.match(slow.now, /slower than usual.*1:45/i);
  assert.match(slow.next, /keep waiting.*stop and retry.*next eligible tutor route/i);
  assert.equal(slow.stalled, true);
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
  assert.equal(studioPreviewRunLabel('failed'), 'Preview failed to run');
  assert.equal(studioPreviewRunLabel({ kind: 'quality', passed: true }), 'Preview is running');
});

test('the build clock counts past a minute', () => {
  const at = (elapsedSec) => resolveStudioPartnerStatus({
    isGenerating: true,
    generatingLabel: 'Building your preview…',
    elapsedSec,
    hasPreview: false,
    streamedBytes: 2048,
  }).next.match(/\d+:\d\d/)?.[0];

  assert.equal(at(59), '0:59');
  assert.equal(at(60), '1:00', 'the minute must roll over, not stay literal');
  assert.equal(at(110), '1:50', 'the primary build attempt budget');
  assert.equal(at(165), '2:45', 'the full turn budget');
});

test('the screenshot: an observed execution label cannot be contradicted by missing counters', () => {
  const label = 'Generating files with anthropic/claude-opus-5 · 1 KB received…';
  for (const elapsedSec of [31, 70, 175]) {
    const status = resolveStudioPartnerStatus({ isGenerating: true, generatingLabel: label, elapsedSec });
    assert.equal(status.now, label);
    assert.match(status.next, /^Elapsed /);
    assert.equal(status.phase, 'unknown');
    assert.equal(status.stalled, false);
    assert.deepEqual(status.actions, []);
    assert.doesNotMatch(status.next, /nothing received|No output|0 B/i);
  }
});

test('a new attempt with unknown telemetry does not inherit the prior attempt progress', () => {
  const first = resolveStudioPartnerStatus({ isGenerating: true, streamedBytes: 1024, elapsedSec: 31 });
  const retry = resolveStudioPartnerStatus({ isGenerating: true, generatingLabel: 'Retrying on the next eligible engine…', elapsedSec: 60 });
  assert.equal(first.phase, 'streaming');
  assert.equal(retry.phase, 'unknown');
  assert.equal(retry.stalled, false);
  assert.doesNotMatch(retry.next, /1\.0 KB|nothing received|No output/);
});
