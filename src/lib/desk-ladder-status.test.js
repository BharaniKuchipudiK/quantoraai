import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

test('an inherited Object member is not mistaken for a reason code', () => {
  // Bracket lookup resolved the prototype: "constructor" was truthy, so the
  // chip rendered "undefined · X" — breaking the never-guess contract.
  for (const reason of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
    assert.equal(deskLadderStatus({ reason, modelName: 'X', autoRouted: true }), null, reason);
  }
});

test('a provider slug is shortened so it cannot swallow the desk header row', () => {
  const status = deskLadderStatus({
    reason: 'escalate_complex_coding',
    modelName: 'qwen/qwen-2.5-coder-32b-instruct:free',
    autoRouted: true,
  });
  assert.equal(status.model, 'qwen-2.5-coder-32b-instruct');
});

/*
 * Guarding the fix for the prototype-key guard, which is not as circular as it
 * sounds. `Object.hasOwn` is the obvious way to write that check and it is what
 * went in first — but Vite 6 still defaults build.target to "modules"
 * (chrome87, firefox78, safari14, edge88) and Object.hasOwn needs Chrome 93,
 * Firefox 92, Safari 15.4. esbuild rewrites syntax, never built-in methods, so
 * it shipped untransformed and threw on those browsers: a crashed desk in place
 * of a chip.
 *
 * Nothing in the fast lane can see that. Node has Object.hasOwn, so the tests
 * pass; it is a real method, so typecheck and eslint pass. Only an old browser
 * disagrees, and none of them run here. So the source is scanned instead —
 * cheap, and the same trick this repo already uses to stop "Live from" being
 * written directly into the trip board.
 *
 * If the build target is ever raised past those versions, delete this test
 * rather than working around it.
 */
test('src never calls a built-in the browser target cannot provide', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry.name) ? [full] : [];
  });

  // Comments are stripped first: naming a banned method in prose — as the note
  // above this test does, and as the fix in desk-ladder-status.js does — is how
  // the reason survives, and must not itself trip the gate.
  const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const offenders = [];
  for (const file of walk('src')) {
    if (file.endsWith('desk-ladder-status.test.js')) continue;
    const source = code(readFileSync(file, 'utf8'));
    for (const method of ['Object.hasOwn', 'Array.prototype.at', 'structuredClone']) {
      if (source.includes(method)) offenders.push(`${file}: ${method}`);
    }
  }

  assert.deepEqual(offenders, [], `unsupported built-ins reach the browser bundle:\n${offenders.join('\n')}`);
});
