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
 * A built-in the browser target cannot provide is invisible to the fast lane.
 * Node has all of them, so the tests pass; they are real methods, so typecheck
 * and eslint pass. Only an old browser disagrees, and none of them run here.
 *
 * This started as a fixed ban list written when build.target was still Vite's
 * "modules" default (chrome87). The target is now stated explicitly, so the
 * list is derived from it instead — raise the target and a built-in stops being
 * banned on its own, with no second place to remember.
 *
 * The floors below are the first version of each engine to ship the method.
 * Only bare calls matter: a feature-detected use with a fallback is safe at any
 * target, which is why `structuredClone` sits in the bundle today from a
 * dependency that guards it, while three un-guarded `Object.hasOwn` calls from
 * react-markdown are what set the floor in the first place.
 */
const CHROME_FLOOR = {
  'Object.hasOwn': 93,
  'Array.prototype.at': 92,
  structuredClone: 98,
  'Array.prototype.findLast': 97,
};

test('src never calls a built-in the declared browser target cannot provide', () => {
  const viteConfig = readFileSync('vite.config.ts', 'utf8');
  const declared = /['"]chrome(\d+)['"]/.exec(viteConfig);
  assert.ok(
    declared,
    'vite.config.ts must state build.target explicitly — the default silently claims chrome87',
  );
  const target = Number(declared[1]);

  const banned = Object.entries(CHROME_FLOOR)
    .filter(([, floor]) => floor > target)
    .map(([name]) => name);

  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry.name) ? [full] : [];
  });

  // Comments are stripped first: naming a banned method in prose — as the note
  // above does — is how the reason survives, and must not itself trip the gate.
  const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const offenders = [];
  for (const file of walk('src')) {
    if (file.endsWith('desk-ladder-status.test.js')) continue;
    const source = code(readFileSync(file, 'utf8'));
    for (const method of banned) {
      if (source.includes(method)) offenders.push(`${file}: ${method} (needs chrome${CHROME_FLOOR[method]}, target is chrome${target})`);
    }
  }

  assert.deepEqual(offenders, [], `built-ins the declared target cannot provide:\n${offenders.join('\n')}`);
});
