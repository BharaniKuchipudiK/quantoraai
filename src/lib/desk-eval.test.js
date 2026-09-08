/**
 * THE EVAL'S OWN GATE.
 *
 * A suite that decides what counts as a platform failure is itself a thing
 * that can be confidently wrong, and this one grades a non-deterministic
 * system. Two properties have to hold or it is worse than nothing:
 *
 *   1. It must not fail on model wobble. A run that goes red because a button
 *      moved is a run nobody executes twice, and then the platform is back to
 *      being tested by its owner in screenshots.
 *   2. It must not pass on a platform outage. A desk that crashed and answered
 *      nothing must never report a clean score — the "green check over a red
 *      log" this repo was built around (§1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_EVAL_CASES, TIERS, casesForTier, estimateRun, turnsForCase } from './desk-eval-corpus.js';
import { OUTCOME, isBlocking, renderReport, scoreRun, verdictFor } from './desk-eval-outcome.js';

const row = (id, outcome, extra = {}) => ({ id, tier: 'simple', outcome, ...extra });

test('a platform fault fails the run; a wrong answer does not', () => {
  /*
   * The separation the whole suite rests on (§5). The model writing a
   * different page is a finding to record. The desk not answering is a fault.
   */
  assert.equal(isBlocking(OUTCOME.DESK_CRASH), true);
  assert.equal(isBlocking(OUTCOME.NO_REPLY), true);
  assert.equal(isBlocking(OUTCOME.NO_PREVIEW), true);
  assert.equal(isBlocking(OUTCOME.TIMEOUT), true);
  assert.equal(isBlocking(OUTCOME.TURN_ERROR), true);
  assert.equal(isBlocking(OUTCOME.REQUEST_STORM), true);

  assert.equal(isBlocking(OUTCOME.BEHAVIOR_MISS), false, 'a model wobble must not redden the run');
  assert.equal(isBlocking(OUTCOME.PASS), false);
});

test('[was-red] a run where the platform died never reports a score', () => {
  /*
   * The trap this file exists to avoid. If correctness were passed/total, a
   * run in which everything crashed would read 0 — a number, implying a
   * measurement was taken. If it were defaulted to 1 for an empty set, a total
   * outage would read PERFECT. Neither happened: nothing was answered, so
   * there is no comprehension number to report, and `null` says exactly that.
   */
  const allDead = [row('a', OUTCOME.DESK_CRASH), row('b', OUTCOME.NO_REPLY)];
  const score = scoreRun(allDead);
  assert.equal(score.answered, 0);
  assert.equal(score.correctness, null, 'a run that measured nothing must not publish a ratio');
  assert.equal(verdictFor(allDead).ok, false);
});

test('correctness is measured against what was answered, not against the total', () => {
  /*
   * Two faults, two numbers. An outage in one case must not also read as a
   * comprehension collapse in the others, or a single dead route makes the
   * desk look like it stopped understanding English.
   */
  const mixed = [
    row('a', OUTCOME.PASS),
    row('b', OUTCOME.PASS),
    row('c', OUTCOME.BEHAVIOR_MISS),
    row('d', OUTCOME.DESK_CRASH),
  ];
  const score = scoreRun(mixed);
  assert.equal(score.total, 4);
  assert.equal(score.answered, 3, 'the crash answered nothing and is not part of the ratio');
  assert.equal(score.correctness, 0.667);
  assert.equal(score.blocking, 1);
});

test('the floor may hold a run back even when nothing crashed', () => {
  const wobbly = [row('a', OUTCOME.PASS), row('b', OUTCOME.BEHAVIOR_MISS)];
  assert.equal(verdictFor(wobbly, { floor: 0 }).ok, true, 'no floor set: findings are recorded, not blocking');
  const held = verdictFor(wobbly, { floor: 0.9 });
  assert.equal(held.ok, false);
  assert.match(held.reasons.join(' '), /below the floor 0\.9/);
});

test('every blocking failure is named in the verdict, with what happened', () => {
  const verdict = verdictFor([row('hello-goodbye', OUTCOME.NO_PREVIEW, { detail: 'the build produced nothing runnable' })]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons[0], /hello-goodbye: no-preview — the build produced nothing runnable/);
});

test('the report leads with failures and prints the score last', () => {
  /*
   * §8, applied to this suite's own output: a report whose findings sit under
   * a wall of passes is one that gets skimmed, and an unread report is a gate
   * nobody is running.
   */
  const report = renderReport(
    [row('ok-one', OUTCOME.PASS), row('bad-one', OUTCOME.BEHAVIOR_MISS, { prompt: 'p', detail: 'never showed "Goodbye"' })],
    { tier: 'smoke', target: 'https://example.test', floor: 0 },
  );
  assert.ok(report.indexOf('## What failed') < report.indexOf('## Every case'), 'failures come first');
  assert.match(report, /never showed "Goodbye"/);
  assert.ok(report.trimEnd().endsWith('floor 0'), 'the measured number is the last thing read');

  /*
   * The headline this test was written to pin. A behavior miss is not blocking
   * and must not redden CI -- but a run that lists a failure and headlines
   * PASS is a green check over a red log. Three words: PASS when everything
   * passed, FINDINGS when the platform held and an answer was wrong, FAIL when
   * something blocking happened or the floor was breached.
   */
  assert.match(report, /DESK EVAL \| FINDINGS \| 1\/2 passed/, 'a listed failure may not headline PASS');

  const clean = renderReport([row('ok-one', OUTCOME.PASS)], { tier: 'smoke', floor: 0 });
  assert.match(clean, /DESK EVAL \| PASS \| 1\/1 passed/);

  const broken = renderReport([row('dead', OUTCOME.DESK_CRASH, { detail: 'composer gone' })], { tier: 'smoke', floor: 0 });
  assert.match(broken, /DESK EVAL \| FAIL \|/);
});

test('every case is mechanically checkable — no case can only be judged by taste', () => {
  /*
   * The corpus's one admission rule. A prompt whose answer needs another model
   * to grade it does not belong here: an LLM judge is a second thing that can
   * be confidently wrong, and this suite exists because a confidently wrong
   * answer raises no error anywhere.
   */
  for (const testCase of DESK_EVAL_CASES) {
    const turns = testCase.turns || [{ expect: testCase.expect }];
    for (const turn of turns) {
      const expect = turn.expect || {};
      const checkable = Boolean(
        expect.showsText || expect.steps || expect.files || expect.absentText
        || expect.showsTextOrEntryChoice || expect.minRows || expect.filesUnchanged
        || expect.headingColorChanged,
      );
      assert.ok(checkable, `${testCase.id}: every turn must state something a machine can verify`);
    }
    assert.ok(testCase.id && testCase.tier, `${testCase.id}: a case needs an id and a tier`);
    assert.ok(TIERS.full.includes(testCase.tier), `${testCase.id}: tier "${testCase.tier}" is not in TIERS.full`);
  }
});

test('the adversarial tier records the incident each case was born from', () => {
  /*
   * A corpus containing only the cases that motivated a fix reads 100% for a
   * platform that got more dangerous. Naming the incident is what stops an
   * adversarial case from being quietly rewritten into an easy one.
   */
  const adversarial = DESK_EVAL_CASES.filter((c) => c.tier === 'adversarial');
  assert.ok(adversarial.length >= 4, 'the incidents this platform has actually had are the corpus that matters');
  for (const testCase of adversarial) {
    assert.ok(testCase.incident, `${testCase.id}: an adversarial case must say which failure it re-runs`);
  }
});

test('tiers are cumulative and the cost of each is knowable before it runs', () => {
  assert.deepEqual(casesForTier('smoke').map((c) => c.tier), ['simple', 'simple', 'simple', 'simple']);
  assert.ok(casesForTier('standard').length > casesForTier('smoke').length);
  assert.ok(casesForTier('full').length > casesForTier('standard').length);
  assert.throws(() => casesForTier('nonsense'), /Unknown tier/);

  const full = estimateRun('full');
  assert.equal(full.turns, DESK_EVAL_CASES.reduce((n, c) => n + turnsForCase(c), 0));
  assert.ok(full.turns > full.cases, 'multi-turn cases must be counted per turn, not per case');
  assert.ok(full.estimatedUsd > 0, 'a run that spends real money must say so before it spends it');
});
