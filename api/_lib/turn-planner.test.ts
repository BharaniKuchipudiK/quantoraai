import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TURN_PLAN_CONFIDENCE_FLOOR,
  TURN_PLAN_SCHEMA,
  cleanTurnPlan,
  planTurnDeterministically,
  plannerPrompt,
  reconcileTurnPlan,
} from './turn-planner.js';

/*
 * PHASE 7, FIRST CUT — the turn planner and its restraint.
 *
 * The model's answer is used only when readable and confident; the rules that
 * used to decide alone are the fallback and the corpus. Two invariants hold
 * whatever the model says: a pinned desk never changes, and a build the desk
 * already owns is never vetoed into chat.
 */

const WELFARE_BRIEF = 'I want to build a website for Ramakrishna Venuzia Owners Welfare association. I have attached the documents. please go through to get more context. create a multi-page website with a Section for Downloads and a Section for Entering Payment details; the webpage must imitate the same excel format and allow the users to enter the information.';

test('the deterministic plan reads the corpus the way the fixes of 2026-09-06 demand', () => {
  const plan = (message: string, extra = {}) => planTurnDeterministically({ message, ...extra });
  assert.equal(plan(WELFARE_BRIEF).lane, 'build', 'a website brief that borrows "excel format" is a build');
  assert.equal(plan(WELFARE_BRIEF).desk, 'coding');
  assert.equal(plan('a presentation about our website').lane, 'office');
  assert.equal(plan('a presentation about our website').officeKind, 'powerpoint');
  assert.equal(plan('export the members list in excel format').officeKind, 'excel');
  assert.equal(plan('help me plan a trip to Bali with hotels and flights').lane, 'advisor');
  assert.equal(plan('help me plan a trip to Bali with hotels and flights').desk, 'travel');
  assert.equal(plan('what is 2 + 2?').lane, 'chat');
  assert.equal(plan('make the header blue', { codingDeskOpen: true, hasDeskFiles: true }).lane, 'build', 'a change to what was built is a build');
  for (const p of [plan(WELFARE_BRIEF), plan('what is 2 + 2?')]) assert.equal(p.confidence, TURN_PLAN_CONFIDENCE_FLOOR, 'the fallback sits exactly at the floor');
});

test('a pinned desk shapes the deterministic plan: no build inside Travel, the desk itself for everything else', () => {
  const inTravel = planTurnDeterministically({ message: 'build me a site for my trip', pinnedDesk: 'travel' });
  assert.equal(inTravel.lane, 'advisor');
  assert.equal(inTravel.desk, 'travel');
  const inCoding = planTurnDeterministically({ message: 'help me plan a trip with hotels and flights', pinnedDesk: 'coding' });
  assert.equal(inCoding.lane, 'chat', 'a coding chat never becomes Travel');
});

test('cleanTurnPlan makes a model answer consistent, and rejects the unreadable', () => {
  assert.equal(cleanTurnPlan(null), null);
  assert.equal(cleanTurnPlan({ lane: 'sideways' }), null);
  const build = cleanTurnPlan({ lane: 'build', desk: 'travel', officeKind: 'excel', buildMode: false, confidence: 1.7, reason: 'x' });
  assert.deepEqual(build, { lane: 'build', desk: 'coding', officeKind: null, buildMode: true, confidence: 1, reason: 'x' });
  assert.equal(cleanTurnPlan({ lane: 'office', desk: 'none', officeKind: 'none', confidence: 0.9 })?.lane, 'chat', 'an office turn without a kind is chat');
  assert.equal(cleanTurnPlan({ lane: 'advisor', desk: 'coding', confidence: 0.9 })?.lane, 'chat', 'an advisor turn needs an advisor desk');
  const advisor = cleanTurnPlan({ lane: 'advisor', desk: 'finance', confidence: 'high' });
  assert.equal(advisor?.desk, 'finance');
  assert.equal(advisor?.confidence, 0, 'unreadable confidence is none');
  assert.deepEqual(TURN_PLAN_SCHEMA.required, ['lane', 'desk', 'officeKind', 'buildMode', 'confidence', 'reason']);
});

test('reconcile: a confident model plan wins, an unconfident one yields to the rules, and both say whether they agreed', () => {
  const deterministic = planTurnDeterministically({ message: 'export the members list in excel format' });
  const confident = reconcileTurnPlan({ model: { lane: 'chat', desk: null, officeKind: null, buildMode: false, confidence: 0.92, reason: 'a question about the export' }, deterministic });
  assert.equal(confident.lane, 'chat');
  assert.equal(confident.source, 'planner');
  assert.equal(confident.agreed, false);
  const timid = reconcileTurnPlan({ model: { lane: 'chat', desk: null, officeKind: null, buildMode: false, confidence: 0.4, reason: '' }, deterministic });
  assert.equal(timid.lane, 'office');
  assert.equal(timid.source, 'fallback');
  const none = reconcileTurnPlan({ model: null, deterministic });
  assert.equal(none.source, 'fallback');
  assert.equal(none.agreed, false);
});

test('INVARIANT: a pinned desk never changes, whatever the model says', () => {
  const deterministic = planTurnDeterministically({ message: 'help me with taxes', pinnedDesk: 'travel' });
  const model = { lane: 'advisor' as const, desk: 'finance' as const, officeKind: null, buildMode: false, confidence: 0.99, reason: 'money' };
  const plan = reconcileTurnPlan({ model, deterministic, pinnedDesk: 'travel' });
  assert.equal(plan.desk, 'travel');
  assert.equal(plan.lane, 'advisor');
  const buildInTravel = reconcileTurnPlan({ model: { ...model, lane: 'build', desk: 'coding', buildMode: true }, deterministic, pinnedDesk: 'travel' });
  assert.equal(buildInTravel.lane, 'advisor');
  assert.equal(buildInTravel.buildMode, false);
  const advisorInCoding = reconcileTurnPlan({ model, deterministic: planTurnDeterministically({ message: 'help me with taxes', pinnedDesk: 'coding' }), pinnedDesk: 'coding' });
  assert.equal(advisorInCoding.lane, 'chat');
  assert.equal(advisorInCoding.desk, null);
});

test('INVARIANT: a build the desk already owns is never vetoed into chat', () => {
  const deterministic = planTurnDeterministically({ message: 'make the button bigger', codingDeskOpen: true, hasDeskFiles: true });
  const model = { lane: 'chat' as const, desk: null, officeKind: null, buildMode: false, confidence: 0.95, reason: 'small talk' };
  const plan = reconcileTurnPlan({ model, deterministic, buildOwned: true });
  assert.equal(plan.lane, 'build');
  assert.equal(plan.buildMode, true);
  assert.equal(plan.source, 'planner', 'the source is still the model; the invariant corrected its lane');
});

test('the prompt carries the whole request, bounded history, attachments as inputs, and the pinned desk', () => {
  const prompt = plannerPrompt({
    message: WELFARE_BRIEF,
    attachments: [{ name: 'bylaws.pdf', kind: 'document' }],
    history: Array.from({ length: 10 }, (_, i) => ({ sender: i % 2 ? 'ai' : 'user', text: `turn ${i} ${'x'.repeat(900)}` })),
    pinnedDesk: 'coding',
  });
  assert.match(prompt, /Attachments are inputs to read, never the thing to make/);
  assert.match(prompt, /"bylaws\.pdf"/);
  assert.match(prompt, /"pinnedDesk":"coding"/);
  assert.ok(prompt.includes('imitate the same excel format'), 'the request travels whole');
  assert.ok(!prompt.includes('turn 3 '), 'only the last six turns travel');
  assert.ok(prompt.includes('turn 9 '));
  assert.ok(!prompt.includes('x'.repeat(700)), 'each history turn is bounded');
});
