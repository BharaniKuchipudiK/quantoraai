/**
 * The turn-level EVIDENCE-BASED STOP, adjudicated.
 *
 * docs/engineering/DETECT_DIAGNOSE_VERIFY_APPLY.md, Apply:
 *
 *   "the loop ends on a pass, a plateau, an unchanged repair, or a spent
 *    budget, never merely because it tried once."
 *
 * The artifact level obeyed this (`planRefinementRound`). The turn level
 * stopped at `MAX_TURN_ATTEMPTS = 2` — it stopped by counting, the one stop
 * condition the standard names as forbidden. Both symptoms the user reported
 * are that constant:
 *
 *   - a boutique build hit the 175s deadline and the ladder stopped after ONE
 *     engine switch, with most of the catalogue untried;
 *   - a route that died in 3 seconds still ended the turn after one retry,
 *     with ~170s of the budget unspent.
 *
 * These tests are the two-way check (CLAUDE.md §2): each [was-red] assertion
 * fails against the count-bounded loop and passes against the evidence-bounded
 * one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { MIN_VIABLE_ATTEMPT_MS, mayRunAttempt, planTurnEscalation } from './turn-escalation.js';

const TURN_DEADLINE_MS = 175_000;

test('[was-red] a fast failure keeps climbing: the budget, not a count, is the bound', () => {
  // The was-red case: a 502 at 3 seconds. Under MAX_TURN_ATTEMPTS=2 the turn
  // apologised here with 172 seconds unspent.
  const plan = planTurnEscalation({
    elapsedMs: 3_000,
    turnDeadlineMs: TURN_DEADLINE_MS,
    engineCount: 5,
  });

  assert.equal(plan.mayAttempt, true);
  assert.ok(plan.maxAttempts > 2, `a 3s failure with 5 engines must allow more than the old 2 attempts, got ${plan.maxAttempts}`);
  assert.equal(mayRunAttempt(3, plan), true, 'attempt 3 was unreachable before and is the whole point');
  assert.equal(mayRunAttempt(5, plan), true);
});

test('[was-red] no doomed attempt: a spent budget stops the loop instead of padding it', () => {
  // The old arithmetic was Math.max(MIN, deadline - elapsed) — a FLOOR. With 3s
  // left it started a 20s attempt that could not finish, then reported the same
  // failure 20 seconds later having billed the tokens.
  const plan = planTurnEscalation({
    elapsedMs: TURN_DEADLINE_MS - 3_000,
    turnDeadlineMs: TURN_DEADLINE_MS,
    engineCount: 5,
  });

  assert.equal(plan.remainingMs, 3_000);
  assert.equal(plan.mayAttempt, false, 'an attempt that cannot plausibly finish must not start');
  assert.equal(plan.attemptBudgetMs, 0, 'no padded floor: the budget reported is the budget that exists');
  assert.equal(plan.stopReason, 'budget-spent');
  assert.equal(mayRunAttempt(2, plan), false, 'the loop stops on the evidence, whatever the attempt number');
});

test('the loop is ALWAYS bounded — the law the old count was protecting', () => {
  // Removing the count must not remove the bound. Two independent ceilings.

  // 1. The wall clock. A slow first attempt leaves room for few or none.
  const nearlySpent = planTurnEscalation({
    elapsedMs: 160_000,
    turnDeadlineMs: TURN_DEADLINE_MS,
    engineCount: 50,
  });
  assert.ok(nearlySpent.maxAttempts <= 1, `15s left cannot fund a deep ladder, got ${nearlySpent.maxAttempts}`);

  // 2. The catalogue. Instant failures must not spin: an engine is worth one
  //    shot per turn, so a finite catalogue is a finite ladder.
  const instantFailures = planTurnEscalation({
    elapsedMs: 0,
    turnDeadlineMs: TURN_DEADLINE_MS,
    engineCount: 2,
  });
  assert.ok(
    instantFailures.maxAttempts <= 3,
    `2 engines + one same-engine brief repair is 3 rungs, got ${instantFailures.maxAttempts}`,
  );
  assert.equal(mayRunAttempt(99, instantFailures), false, 'no evidence ever authorises an unbounded climb');
});

test('a turn always gets its first attempt, even with a hostile clock', () => {
  for (const turnDeadlineMs of [0, 1_000, MIN_VIABLE_ATTEMPT_MS]) {
    const plan = planTurnEscalation({ elapsedMs: 0, turnDeadlineMs, engineCount: 1 });
    assert.ok(plan.maxAttempts >= 1, `deadline ${turnDeadlineMs} must still permit attempt 1`);
  }
});

test('the attempt budget is what remains — never padded, never negative', () => {
  const healthy = planTurnEscalation({ elapsedMs: 25_000, turnDeadlineMs: TURN_DEADLINE_MS, engineCount: 3 });
  assert.equal(healthy.attemptBudgetMs, 150_000, 'the next attempt gets the real remainder');

  const overrun = planTurnEscalation({ elapsedMs: 400_000, turnDeadlineMs: TURN_DEADLINE_MS, engineCount: 3 });
  assert.equal(overrun.remainingMs, 0, 'an overrun clock reports zero, not a negative budget');
  assert.equal(overrun.mayAttempt, false);
});

test('garbage inputs fail closed, never into an unbounded loop', () => {
  for (const bad of [
    { elapsedMs: Number.NaN, turnDeadlineMs: TURN_DEADLINE_MS, engineCount: 3 },
    { elapsedMs: 0, turnDeadlineMs: Number.NaN, engineCount: 3 },
    { elapsedMs: 0, turnDeadlineMs: Number.POSITIVE_INFINITY, engineCount: 3 },
  ]) {
    const plan = planTurnEscalation(bad);
    assert.ok(Number.isFinite(plan.maxAttempts), `maxAttempts must stay finite for ${JSON.stringify(bad)}`);
    assert.ok(plan.maxAttempts >= 1 && plan.maxAttempts <= 51, `bounded ceiling, got ${plan.maxAttempts}`);
  }
  assert.equal(mayRunAttempt(1, null), false, 'a missing plan authorises nothing');
});
