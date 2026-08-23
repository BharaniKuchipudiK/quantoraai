import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OFFICE_COMPILE_RESERVE_MS,
  OFFICE_PROXY_BUDGET_MS,
  officeGenerationMaxAttempts,
  officeModelCallBudgetMs,
  officeTimeoutUserMessage,
  pickOfficeProvidersForAttempt,
  remainingOfficeBudgetMs,
  shouldStartAnotherOfficeAttempt,
} from './office-generation-budget.js';

test('the host budget leaves time to answer in JSON before a typical proxy 504', () => {
  assert.equal(OFFICE_PROXY_BUDGET_MS < 60_000, true);
  assert.equal(officeGenerationMaxAttempts('powerpoint'), 1);
  assert.equal(officeGenerationMaxAttempts('word'), 1);
});

test('remaining budget never goes negative', () => {
  assert.equal(remainingOfficeBudgetMs(0, 90_000, 55_000), 0);
  assert.equal(remainingOfficeBudgetMs(10_000, 20_000, 55_000), 45_000);
});

test('model calls keep a compile reserve so we can still return JSON', () => {
  const budget = officeModelCallBudgetMs(55_000);
  assert.equal(budget, 55_000 - OFFICE_COMPILE_RESERVE_MS);
  assert.ok(budget < 55_000);
});

test('a second model attempt is refused once the clock is nearly gone', () => {
  assert.equal(shouldStartAnotherOfficeAttempt(10_000, 0, 3), false);
  assert.equal(shouldStartAnotherOfficeAttempt(40_000, 0, 1), true);
  assert.equal(shouldStartAnotherOfficeAttempt(40_000, 1, 1), false);
  assert.equal(shouldStartAnotherOfficeAttempt(40_000, 0, 2), true);
});

test('each attempt uses one provider first instead of walking the whole list as a single timeout', () => {
  assert.deepEqual(pickOfficeProvidersForAttempt(['anthropic', 'gemini', 'openrouter'], 0), ['anthropic', 'gemini', 'openrouter']);
  assert.deepEqual(pickOfficeProvidersForAttempt(['anthropic', 'gemini', 'openrouter'], 1), ['gemini', 'anthropic', 'openrouter']);
});

test('timeout copy blames the host clock, not keys', () => {
  assert.match(officeTimeoutUserMessage(), /platform clock/i);
  assert.match(officeTimeoutUserMessage(), /not a missing API key/i);
});
