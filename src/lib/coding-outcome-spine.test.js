import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';
import { assessShopBuildAsk } from './shop-catalog-scale.js';

const FOX = 'Build a Fox & Wolf kids merchandise shop with 100 unique design images and checkout.';

test('timeout on a normal coding turn proposes a smaller rebuild, not a raw deadline dump', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', turnDeadlineSec: 90 });
  assert.match(outcome.text, /What failed/i);
  assert.match(outcome.text, /What we’ll do|What we'll do/i);
  assert.ok(outcome.continueSet?.items?.some((item) => /smaller/i.test(item.label)));
});

test('timeout on oversize shop uses intake chips', () => {
  const ask = assessShopBuildAsk(FOX);
  const outcome = resolveCodingTurnOutcome({
    kind: 'timeout',
    turnDeadlineSec: 90,
    shopIntakeAsk: ask,
  });
  assert.match(outcome.text, /Start with 10|working product photos/i);
  assert.ok(outcome.continueSet?.items?.length >= 1);
});

test('no-preview outcome never says only Connection Error', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'no-preview' });
  assert.match(outcome.text, /no runnable files/i);
  assert.match(outcome.text, /What we’ll do|What we'll do/i);
  assert.equal(/Connection Error/i.test(outcome.text), false);
});

test('provider death under overload still offers a next step', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'Model overloaded (503)',
  });
  assert.match(outcome.text, /under load|overload/i);
  assert.match(outcome.text, /What we’ll do|What we'll do/i);
  assert.ok(outcome.continueSet?.items?.length >= 1);
});

/* A timeout mid-job must checkpoint the work, not discard it. */

const jobWith = (doneCount, total = 3) => ({
  goal: 'shop',
  steps: Array.from({ length: total }, (_, i) => ({
    title: `Step ${i + 1}`,
    files: [`f${i}.js`],
    done: i < doneCount,
  })),
});

test('a timeout with proved steps offers Continue, not a smaller rebuild', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', turnDeadlineSec: 175, job: jobWith(1) });
  assert.equal(outcome.kind, 'timeout-checkpoint');
  assert.doesNotMatch(outcome.text, /smaller/i);
  assert.match(outcome.text, /1 of 3 steps/);
  assert.equal(outcome.continueSet.items[0].label, 'Continue — step 2 of 3');
});

test('the continue value is the bare word the resume path recognises', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', job: jobWith(2) });
  // Must satisfy useChatStream's resumingJob test, which is anchored and exact.
  assert.match(outcome.continueSet.items[0].value, /^\s*(continue|next|next step|go on|carry on|keep going)\b[\s.!]*$/i);
});

test('a checkpoint is not an error — work was done and kept', () => {
  assert.equal(resolveCodingTurnOutcome({ kind: 'timeout', job: jobWith(1) }).isError, false);
});

test('a timeout with no proved step keeps the retry-smaller advice', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', turnDeadlineSec: 175, job: jobWith(0) });
  assert.notEqual(outcome.kind, 'timeout-checkpoint');
  assert.match(outcome.text, /smaller/i);
  assert.equal(outcome.isError, true);
});

test('a timeout with no job at all is unchanged', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', turnDeadlineSec: 175 });
  assert.notEqual(outcome.kind, 'timeout-checkpoint');
  assert.match(outcome.text, /smaller/i);
});

test('a finished job does not offer to continue past its own last step', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', job: jobWith(3, 3) });
  assert.notEqual(outcome.kind, 'timeout-checkpoint');
});

test('checkpointing names the next step so continuing is not a leap of faith', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', job: jobWith(1) });
  assert.match(outcome.text, /Step 2/);
});

test('a malformed job falls back to the old advice rather than throwing', () => {
  for (const bad of [{ steps: null }, { steps: [] }, {}]) {
    const outcome = resolveCodingTurnOutcome({ kind: 'timeout', turnDeadlineSec: 175, job: bad });
    assert.notEqual(outcome.kind, 'timeout-checkpoint', JSON.stringify(bad));
  }
});

test('a stopped turn never becomes a checkpoint, even mid-job', () => {
  assert.equal(resolveCodingTurnOutcome({ kind: 'stopped', job: jobWith(2) }).kind, 'stopped');
});

test('the Continue label names the step it actually resumes at, even out of order', () => {
  // build-job proves each step independently, so a model writing step 3 first
  // yields [not-done, not-done, done]. `done + 1` then disagreed with "Next:".
  const job = { goal: 'x', steps: [{ title: 'One', done: false }, { title: 'Two', done: false }, { title: 'Three', done: true }] };
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', job });
  assert.match(outcome.text, /\*\*Next:\*\* One/);
  assert.equal(outcome.continueSet.items[0].label, 'Continue — step 1 of 3');
});

test('an oversize catalogue keeps its chips alongside Continue', () => {
  /*
   * Continue alone re-runs the same oversized build into the same deadline —
   * the loop the shop chips exist to break.
   */
  const job = { goal: 'shop', steps: [{ title: 'A', done: true }, { title: 'B', done: false }] };
  const shopIntakeAsk = { oversize: true, chips: [{ id: 'shop-agree-smaller', label: 'Build 20', value: 'Build 20' }] };
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', job, shopIntakeAsk });
  const ids = outcome.continueSet.items.map((item) => item.id);
  assert.deepEqual(ids, ['outcome-continue-job', 'shop-agree-smaller']);
});

test('an oversize catalogue with no proved step keeps the shop path entirely', () => {
  const job = { goal: 'shop', steps: [{ title: 'A', done: false }] };
  const shopIntakeAsk = { oversize: true, chips: [{ id: 'shop-agree-smaller', label: 'Build 20', value: 'Build 20' }] };
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', job, shopIntakeAsk });
  assert.notEqual(outcome.kind, 'timeout-checkpoint');
  assert.deepEqual(outcome.continueSet.items.map((i) => i.id), ['shop-agree-smaller']);
});
