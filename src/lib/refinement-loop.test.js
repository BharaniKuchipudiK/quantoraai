import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_REFINEMENT_ROUNDS,
  REFINEMENT_STOP,
  bestScore,
  describeRefinementStop,
  formatAttemptMemory,
  planRefinementRound,
} from '../../shared/refinement-loop.js';

const round = (score, passed, issues = ['hero contrast is poor']) => ({ score, passed, issues });

test('a failing build with named issues earns another round', () => {
  const plan = planRefinementRound([round(52, false)]);
  assert.equal(plan.proceed, true);
  assert.equal(plan.round, 1);
});

test('a passing build never spends a round', () => {
  const plan = planRefinementRound([round(91, true, [])]);
  assert.equal(plan.proceed, false);
  assert.equal(plan.reason, REFINEMENT_STOP.PASSED);
});

test('a failure with no named issue stops — there is nothing to act on', () => {
  const plan = planRefinementRound([round(40, false, [])]);
  assert.equal(plan.proceed, false);
  assert.equal(plan.reason, REFINEMENT_STOP.NO_ISSUES);
});

test('improvement keeps the loop alive', () => {
  const plan = planRefinementRound([round(50, false), round(66, false)]);
  assert.equal(plan.proceed, true);
  assert.equal(plan.round, 2);
});

test('a plateau stops the loop instead of burning the budget', () => {
  // 50 -> 51 is inside the noise band of a non-deterministic grader.
  const plan = planRefinementRound([round(50, false), round(51, false)]);
  assert.equal(plan.proceed, false);
  assert.equal(plan.reason, REFINEMENT_STOP.PLATEAU);
});

test('a regression stops the loop', () => {
  const plan = planRefinementRound([round(70, false), round(58, false)]);
  assert.equal(plan.proceed, false);
  assert.equal(plan.reason, REFINEMENT_STOP.PLATEAU);
});

test('progress must beat the BEST so far, not merely the previous round', () => {
  // 80 then 60 then 62: climbing again, but still far below what we had.
  const plan = planRefinementRound([round(80, false), round(60, false), round(62, false)]);
  assert.equal(plan.proceed, false);
  assert.equal(plan.reason, REFINEMENT_STOP.PLATEAU);
});

test('an unchanged repair stops the loop immediately', () => {
  const plan = planRefinementRound([round(50, false), round(70, false)], { lastRepairChangedNothing: true });
  assert.equal(plan.proceed, false);
  assert.equal(plan.reason, REFINEMENT_STOP.NO_CHANGE);
});

test('the budget is finite even when every round improves', () => {
  let history = [round(10, false)];
  let rounds = 0;
  for (let i = 0; i < 20; i += 1) {
    const plan = planRefinementRound(history);
    if (!plan.proceed) {
      assert.equal(plan.reason, REFINEMENT_STOP.BUDGET);
      break;
    }
    rounds += 1;
    history = [...history, round(10 + rounds * 10, false)];
  }
  assert.equal(rounds, MAX_REFINEMENT_ROUNDS);
});

test('no verification yet is not a reason to repair', () => {
  assert.equal(planRefinementRound([]).proceed, false);
  assert.equal(planRefinementRound(null).reason, REFINEMENT_STOP.NO_VERIFICATION);
});

test('bestScore ignores rounds that produced no score', () => {
  assert.equal(bestScore([round(40, false), { passed: false, issues: [] }, round(72, false)]), 72);
  assert.equal(bestScore([]), null);
});

test('memory names what each round scored and what stayed wrong', () => {
  const memory = formatAttemptMemory([
    round(40, false, ['no product photos']),
    round(44, false, ['no product photos', 'cart does nothing']),
  ]);
  assert.match(memory, /Initial build: score 40/);
  assert.match(memory, /After repair 1: score 44/);
  assert.match(memory, /cart does nothing/);
});

test('memory tells the model plainly when nothing has improved', () => {
  const memory = formatAttemptMemory([round(60, false), round(55, false)]);
  assert.match(memory, /has NOT improved/);
});

test('the first round carries no memory — there is nothing to remember', () => {
  assert.equal(formatAttemptMemory([round(50, false)]), '');
});

test('every stop reason explains itself to the user', () => {
  for (const reason of [REFINEMENT_STOP.PLATEAU, REFINEMENT_STOP.BUDGET, REFINEMENT_STOP.NO_CHANGE, REFINEMENT_STOP.NO_ISSUES]) {
    const text = describeRefinementStop(reason, [round(61, false)]);
    assert.ok(text.length > 0, `${reason} must explain itself`);
    assert.doesNotMatch(text, /something went wrong/i);
  }
  assert.match(describeRefinementStop(REFINEMENT_STOP.BUDGET, [round(61, false)]), /61/);
});
