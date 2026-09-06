import test from 'node:test';
import assert from 'node:assert/strict';
import { planGoldenTransactions } from './lib/golden-plan.mjs';

const ROSTER = ['calculator', 'simple-website', 'guided-intake', 'business-tool', 'document-grounded'];

test('unset means the whole roster: a run that forgets the variable covers more, never less', () => {
  for (const value of [undefined, null, '', '  ', '0', '-1', 'two', 'NaN']) {
    const plan = planGoldenTransactions(ROSTER, value);
    assert.deepEqual(plan.planned, ROSTER, `${JSON.stringify(value)} must plan all five`);
    assert.equal(plan.limit, 5);
  }
});

test('a limit plans a prefix of the roster, in order', () => {
  assert.deepEqual(planGoldenTransactions(ROSTER, '2').planned, ['calculator', 'simple-website']);
  assert.deepEqual(planGoldenTransactions(ROSTER, ' 1 ').planned, ['calculator']);
  assert.deepEqual(planGoldenTransactions(ROSTER, 3.9).planned, ROSTER.slice(0, 3), 'a fraction rounds down');
});

test('a limit above the roster is the roster', () => {
  const plan = planGoldenTransactions(ROSTER, '9');
  assert.deepEqual(plan.planned, ROSTER);
  assert.equal(plan.limit, 5);
  assert.equal(plan.total, 5);
});
