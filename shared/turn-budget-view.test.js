/*
 * The meter must be absent rather than wrong.
 *
 * A usage bar is read at a glance and believed. Every case here is one where
 * a plausible implementation draws something reassuring out of nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeResetIn, turnBudgetView } from './turn-budget-view.js';

const NOW = Date.parse('2026-09-08T10:00:00Z');

test('[was-red] an unknown count draws no bar, because empty is the most flattering lie', () => {
  /*
   * hit_rate_limit returns null hits when the durable store did not answer.
   * Rendered as a number that would be 0, the bar shows a full allowance
   * untouched -- the best possible news, produced by measuring nothing. Same
   * class as a dead telemetry store reading as a quiet day.
   */
  assert.equal(turnBudgetView({ limit: 60, used: null, resetsAt: null }, NOW), null);
  assert.equal(turnBudgetView({ limit: 60, used: undefined }, NOW), null);
  assert.equal(turnBudgetView({ limit: 0, used: 3 }, NOW), null, 'a zero limit has no bar to draw');
  assert.equal(turnBudgetView(null, NOW), null);
  assert.equal(turnBudgetView(undefined, NOW), null);
});

test('the bar reports the standing, and cannot run past its own end', () => {
  const mid = turnBudgetView({ limit: 60, used: 15, resetsAt: '2026-09-09T00:00:00Z' }, NOW);
  assert.equal(mid.remaining, 45);
  assert.equal(mid.percentUsed, 25);
  assert.equal(mid.exhausted, false);
  assert.equal(mid.resetsIn, 'in 14h');

  /*
   * The refusal is itself a counted hit, so used CAN exceed the limit. A bar
   * past 100% renders outside its track.
   */
  const over = turnBudgetView({ limit: 60, used: 63, resetsAt: '2026-09-09T00:00:00Z' }, NOW);
  assert.equal(over.percentUsed, 100);
  assert.equal(over.remaining, 0);
  assert.equal(over.exhausted, true);
});

test('a shared ceiling is marked as shared, so the copy never blames the person', () => {
  assert.equal(turnBudgetView({ scope: 'platform', limit: 500, used: 500 }, NOW).shared, true);
  assert.equal(turnBudgetView({ scope: 'user', limit: 60, used: 60 }, NOW).shared, false);
});

test('the countdown is a duration, and unknown stays unknown', () => {
  assert.equal(describeResetIn('2026-09-09T00:00:00Z', NOW), 'in 14h');
  assert.equal(describeResetIn('2026-09-08T12:03:00Z', NOW), 'in 2h 3m');
  assert.equal(describeResetIn('2026-09-08T10:12:00Z', NOW), 'in 12m');
  assert.equal(describeResetIn('2026-09-08T10:00:30Z', NOW), 'shortly', 'never "in 0m"');
  assert.equal(describeResetIn('2026-09-08T09:00:00Z', NOW), 'shortly', 'a past reset is not negative time');
  assert.equal(describeResetIn(null, NOW), null);
  assert.equal(describeResetIn('nonsense', NOW), null);

  /* A meter with no reset time still draws; it just promises nothing. */
  assert.equal(turnBudgetView({ limit: 60, used: 60, resetsAt: null }, NOW).resetsIn, null);
});
