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
 * Two earlier versions of this were wrong in ways worth recording, because both
 * failures were silent — the guard passed while catching nothing.
 *
 * It matched literal strings like "Array.prototype.findLast". Nobody writes
 * that. Real code writes `items.findLast(...)`, so those entries could never
 * match anything and the ban existed only in the list. Call syntax is matched
 * now, and every entry is proved against a call written the way a person
 * writes it.
 *
 * And it read only the chrome version out of build.target. The floors differ
 * per engine — structuredClone is Chrome 98 but Firefox 94, findLast is
 * Chrome 97 but Firefox 104 — so a target of chrome98 with firefox92 would
 * have unbanned both while Firefox still lacked them. Every declared engine is
 * compared now, and a built-in is banned if any one of them is below its floor.
 *
 * Only bare calls matter: a feature-detected use with a fallback is safe at any
 * target, which is why structuredClone sits in the bundle today from a
 * dependency that guards it, while three un-guarded Object.hasOwn calls from
 * react-markdown are what set the floor in the first place.
 */
const BROWSER_FLOORS = {
  'Object.hasOwn()': { call: /\bObject\.hasOwn\s*\(/, chrome: 93, edge: 93, firefox: 92, safari: 15.4 },
  'structuredClone()': { call: /\bstructuredClone\s*\(/, chrome: 98, edge: 98, firefox: 94, safari: 15.4 },
  '.at()': { call: /\.at\s*\(/, chrome: 92, edge: 92, firefox: 90, safari: 15.4 },
  '.findLast()': { call: /\.findLast(?:Index)?\s*\(/, chrome: 97, edge: 97, firefox: 104, safari: 15.4 },
};

test('src never calls a built-in the declared browser target cannot provide', () => {
  const viteConfig = readFileSync('vite.config.ts', 'utf8');
  const target = /target:\s*\[([^\]]+)\]/.exec(viteConfig);
  assert.ok(
    target,
    'vite.config.ts must state build.target explicitly — the default silently claims chrome87',
  );

  const declared = {};
  for (const [, engine, version] of target[1].matchAll(/['"](chrome|edge|firefox|safari)([\d.]+)['"]/g)) {
    declared[engine] = Number(version);
  }
  assert.ok(Object.keys(declared).length, `build.target names no browser engines: ${target[1]}`);

  // Banned if ANY declared engine sits below that built-in's floor for it.
  const banned = Object.entries(BROWSER_FLOORS).filter(([, floors]) => Object
    .entries(declared)
    .some(([engine, version]) => floors[engine] !== undefined && version < floors[engine]));

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
    for (const [name, floors] of banned) {
      if (!floors.call.test(source)) continue;
      const short = Object.entries(declared)
        .filter(([engine, version]) => floors[engine] !== undefined && version < floors[engine])
        .map(([engine, version]) => `${engine}${version} < ${floors[engine]}`)
        .join(', ');
      offenders.push(`${file}: ${name} — ${short}`);
    }
  }

  assert.deepEqual(offenders, [], `built-ins the declared target cannot provide:\n${offenders.join('\n')}`);
});
