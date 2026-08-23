import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkState,
  deriveJobChecks,
  failingChecks,
  findObservableCriterion,
  unverifiedChecks,
} from './studio-desk-criteria.js';

const todo = { purpose: 'A to-do list', mustWork: ['Items can still be added', 'Keep this a to-do list'] };

test('a must-work line the page can be asked becomes an observable criterion', () => {
  assert.equal(findObservableCriterion('Items can still be added')?.fact, 'itemAdded');
  assert.equal(findObservableCriterion('Interactive controls still work')?.fact, 'controlResponded');
  assert.equal(findObservableCriterion('The page still runs')?.fact, 'pageRendered');
});

test('a must-work line the page cannot be asked has no criterion', () => {
  assert.equal(findObservableCriterion('Keep this a to-do list'), null);
  assert.equal(findObservableCriterion('Do not replace this with a different product'), null);
  assert.equal(findObservableCriterion(''), null);
});

test('a criterion nobody probed is unverified, never a pass', () => {
  const checks = deriveJobChecks(todo, null);
  const added = checks.find((check) => check.id === 'job-add-item');
  assert.equal(added.state, 'unverified');
  assert.equal(added.ok, false);
  assert.match(added.label, /Not checked on Preview yet/);
  assert.equal(failingChecks(checks).length, 0);
  assert.equal(unverifiedChecks(checks).length, 2);
});

test('a live probe turns the criterion into a real pass or a real fail', () => {
  const failing = deriveJobChecks(todo, { itemAdded: false });
  assert.deepEqual(
    failing.filter((check) => check.id === 'job-add-item').map((check) => [check.state, check.label]),
    [['fix', 'Adding an item does nothing on the running Preview']],
  );
  const passing = deriveJobChecks(todo, { itemAdded: true });
  assert.equal(passing.find((check) => check.id === 'job-add-item').state, 'ok');
  assert.equal(failingChecks(passing).length, 0);
});

test('an unprobable must-work line stays unverified even when the page answered others', () => {
  const checks = deriveJobChecks(todo, { itemAdded: true, controlResponded: true, pageRendered: true });
  const guardrail = checks.find((check) => /Keep this a to-do list/.test(check.label));
  assert.equal(guardrail.state, 'unverified');
  assert.equal(guardrail.ok, false);
});

test('a non-boolean observation is not treated as an answer', () => {
  for (const value of ['true', 1, {}, null, undefined]) {
    assert.equal(deriveJobChecks(todo, { itemAdded: value }).find((check) => check.id === 'job-add-item').state, 'unverified');
  }
});

test('no job card means no derived criteria', () => {
  assert.deepEqual(deriveJobChecks(null, { itemAdded: true }), []);
  assert.deepEqual(deriveJobChecks({ purpose: 'A to-do list', mustWork: [] }, { itemAdded: true }), []);
});

test('two must-work lines about the same criterion do not double the row', () => {
  const checks = deriveJobChecks(
    { purpose: 'A list', mustWork: ['Items can still be added', 'An item can be added from the form'] },
    { itemAdded: true },
  );
  assert.equal(checks.filter((check) => check.id === 'job-add-item').length, 1);
});

test('unverified rows never become the next beat', () => {
  const checks = deriveJobChecks(todo, { itemAdded: true });
  assert.equal(failingChecks(checks).length, 0);
  assert.equal(checkState({ id: 'x', ok: false, state: 'unverified' }), 'unverified');
  assert.equal(checkState({ id: 'x', ok: false }), 'fix');
  assert.equal(checkState({ id: 'x', ok: true }), 'ok');
});
