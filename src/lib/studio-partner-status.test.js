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

test('after a working preview, names the next business beat', () => {
  const status = resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    continueLabel: 'Add a payment gateway',
  });
  assert.match(status.now, /Open Coding desk/i);
  assert.match(status.next, /Add a payment gateway/);
});

test('an open coding desk does not repeat that the preview exists', () => {
  assert.equal(resolveStudioPartnerStatus({
    hasPreview: true,
    lastAiText: 'Built Varnika',
    codingDeskOpen: true,
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

test('empty studio has no partner strip', () => {
  assert.equal(resolveStudioPartnerStatus({}), null);
});

test('greeting copy does not lecture about missing preview', () => {
  assert.equal(resolveStudioPartnerStatus({
    lastAiText: 'Hello Creator! What would you like to create or ask today?',
    hasUserTurn: false,
  }), null);
});

test('after a real chat reply with no preview, the strip explains the gap', () => {
  const status = resolveStudioPartnerStatus({
    lastAiText: 'Bali in March is usually dry in the south.',
    hasUserTurn: true,
  });
  assert.match(status.now, /no runnable preview/i);
});

test('Travel never asks for a website preview', () => {
  const status = resolveStudioPartnerStatus({
    lastAiText: 'I could not retrieve live hotel results.',
    hasUserTurn: true,
    studioDomain: 'travel',
  });
  assert.doesNotMatch(status.now, /runnable preview/i);
  assert.doesNotMatch(status.next, /working page/i);
  assert.match(status.now, /trip conversation/i);
});

test('Study generating status is one line with the clock', () => {
  const status = resolveStudioPartnerStatus({
    isGenerating: true,
    elapsedSec: 4,
    studioDomain: 'education',
  });
  assert.match(status.now, /Working on your next step/i);
  assert.match(status.now, /0:04/);
  assert.equal(status.next, '');
});

test('Study never asks for a website preview', () => {
  const status = resolveStudioPartnerStatus({
    lastAiText: 'Let us repair vector components first.',
    hasUserTurn: true,
    studioDomain: 'education',
  });
  assert.doesNotMatch(status.next, /working page/i);
  assert.match(status.now, /tutor/i);
});
