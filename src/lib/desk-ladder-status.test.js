import test from 'node:test';
import assert from 'node:assert/strict';
import { deskLadderStatus, deskLadderSummary } from './desk-ladder-status.js';

test('the fast default reads as the fast lane', () => {
  const status = deskLadderStatus({ reason: 'default_gemini', modelName: 'Gemini Flash', autoRouted: true });
  assert.equal(status.tier, 'fast');
  assert.equal(status.model, 'Gemini Flash');
  assert.match(status.detail, /fast coder/);
});

test('every escalation reason reads as escalated', () => {
  for (const reason of ['escalate_complex_coding', 'escalate_refine_or_repair', 'escalate_shop_image_oversize']) {
    const status = deskLadderStatus({ reason, modelName: 'Qwen Coder', autoRouted: true });
    assert.equal(status.tier, 'strong', reason);
    assert.equal(status.title, 'Escalated', reason);
  }
});

test('a deliberate refusal to escalate is shown as held, not as a fast lane', () => {
  const unproven = deskLadderStatus({ reason: 'stay_gemini_unproven_free', modelName: 'Gemini Flash', autoRouted: true });
  assert.equal(unproven.tier, 'held');
  assert.match(unproven.detail, /on purpose/);

  const unavailable = deskLadderStatus({ reason: 'escalate_unavailable_stay_gemini', modelName: 'Gemini Flash', autoRouted: true });
  assert.equal(unavailable.tier, 'held');
  assert.match(unavailable.detail, /none was available/);
});

test('a pinned model is never dressed up as a routing decision', () => {
  assert.equal(deskLadderStatus({ reason: 'default_gemini', modelName: 'Gemini Flash', autoRouted: false }), null);
});

test('an unknown or missing reason shows nothing rather than guessing', () => {
  assert.equal(deskLadderStatus({ reason: 'invented_reason', modelName: 'X', autoRouted: true }), null);
  assert.equal(deskLadderStatus({ reason: '', modelName: 'X', autoRouted: true }), null);
  assert.equal(deskLadderStatus({ autoRouted: true }), null);
});

test('a reason with no model name shows nothing', () => {
  assert.equal(deskLadderStatus({ reason: 'default_gemini', modelName: '', autoRouted: true }), null);
});

test('the free suffix is stripped from the displayed name', () => {
  const status = deskLadderStatus({ reason: 'default_gemini', modelName: 'Qwen Coder (free)', autoRouted: true });
  assert.equal(status.model, 'Qwen Coder');
});

test('summary folds the status into one line, and is empty for nothing', () => {
  const status = deskLadderStatus({ reason: 'escalate_complex_coding', modelName: 'Qwen Coder', autoRouted: true });
  assert.equal(deskLadderSummary(status), 'Escalated: Qwen Coder — Complex or multi-file ask — moved up to a stronger coder.');
  assert.equal(deskLadderSummary(null), '');
});

test('a planner lesson annotation on the reason still resolves', () => {
  const status = deskLadderStatus({
    reason: 'escalate_complex_coding+lesson_escalate',
    modelName: 'Qwen Coder',
    autoRouted: true,
  });
  assert.equal(status.tier, 'strong');
  assert.equal(status.title, 'Escalated');
});

test('an annotation on an unknown base reason still shows nothing', () => {
  assert.equal(deskLadderStatus({ reason: 'nonsense+lesson_escalate', modelName: 'X', autoRouted: true }), null);
});
