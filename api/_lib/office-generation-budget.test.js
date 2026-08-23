import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  OFFICE_CLIENT_COMPILE_ABORT_MS,
  OFFICE_CLIENT_GENERATE_ABORT_MS,
  OFFICE_COMPILE_RESERVE_MS,
  OFFICE_FAST_FAILOVER_MS,
  OFFICE_HOST_PROXY_LIMIT_MS,
  OFFICE_MAX_ATTEMPTS,
  OFFICE_MAX_FULL_PROVIDER_CALLS,
  OFFICE_PROXY_BUDGET_MS,
  officeGenerationMaxAttempts,
  officeModelCallBudgetMs,
  officeProviderOrder,
  officeTimeoutUserMessage,
  officeWorstCaseGenerationMs,
  pickOfficeProvidersForAttempt,
  remainingOfficeBudgetMs,
  shouldOfficeProviderFailover,
  shouldStartAnotherOfficeAttempt,
} from './office-generation-budget.js';

test('the host budget leaves time to answer in JSON before a typical proxy 504', () => {
  assert.equal(OFFICE_PROXY_BUDGET_MS < OFFICE_HOST_PROXY_LIMIT_MS, true);
  assert.equal(officeGenerationMaxAttempts('powerpoint'), 1);
  assert.equal(officeGenerationMaxAttempts('word'), 1);
  assert.equal(officeGenerationMaxAttempts('excel'), 1);
  assert.equal(OFFICE_MAX_ATTEMPTS, 1);
  assert.equal(OFFICE_MAX_FULL_PROVIDER_CALLS, 1);
});

test('worst-case attempts × provider walk × per-call timeout + compile reserve stays inside the host clock', () => {
  const perCall = officeModelCallBudgetMs(OFFICE_PROXY_BUDGET_MS);
  const worstCase = officeWorstCaseGenerationMs();
  assert.equal(pickOfficeProvidersForAttempt(['anthropic', 'gemini', 'openrouter'], 0).length, 1);
  assert.equal(worstCase, OFFICE_MAX_ATTEMPTS * OFFICE_MAX_FULL_PROVIDER_CALLS * perCall + OFFICE_COMPILE_RESERVE_MS);
  assert.ok(worstCase <= OFFICE_PROXY_BUDGET_MS, `worst-case ${worstCase}ms exceeds OFFICE_PROXY_BUDGET_MS`);
  assert.ok(worstCase < OFFICE_HOST_PROXY_LIMIT_MS, `worst-case ${worstCase}ms would 504 at the 60s proxy`);
  assert.ok(OFFICE_CLIENT_GENERATE_ABORT_MS < OFFICE_HOST_PROXY_LIMIT_MS);
  assert.ok(OFFICE_CLIENT_COMPILE_ABORT_MS <= OFFICE_PROXY_BUDGET_MS);
  assert.ok(OFFICE_CLIENT_COMPILE_ABORT_MS < OFFICE_HOST_PROXY_LIMIT_MS);
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

test('each attempt uses one primary provider instead of walking the whole list as a single timeout', () => {
  assert.deepEqual(pickOfficeProvidersForAttempt(['anthropic', 'gemini', 'openrouter'], 0), ['anthropic']);
  assert.deepEqual(pickOfficeProvidersForAttempt(['anthropic', 'gemini', 'openrouter'], 1), ['gemini']);
  assert.deepEqual(officeProviderOrder(['anthropic', 'gemini', 'openrouter'], 0), ['anthropic', 'gemini', 'openrouter']);
});

test('failover is only allowed after a quick primary miss with compile time left', () => {
  assert.equal(shouldOfficeProviderFailover({ providersTried: 0, remainingMs: 40_000 }), true);
  assert.equal(shouldOfficeProviderFailover({
    providersTried: 1,
    firstElapsedMs: OFFICE_FAST_FAILOVER_MS - 1,
    remainingMs: 40_000,
  }), true);
  assert.equal(shouldOfficeProviderFailover({
    providersTried: 1,
    firstElapsedMs: 20_000,
    remainingMs: 40_000,
  }), false);
  assert.equal(shouldOfficeProviderFailover({
    providersTried: 1,
    firstElapsedMs: 1_000,
    remainingMs: 10_000,
  }), false);
  assert.equal(shouldOfficeProviderFailover({
    providersTried: 2,
    firstElapsedMs: 500,
    remainingMs: 40_000,
  }), false);
});

test('timeout copy blames the host clock, not keys', () => {
  assert.match(officeTimeoutUserMessage(), /platform clock/i);
  assert.match(officeTimeoutUserMessage(), /not a missing API key/i);
});

test('Office generate, compile, and client abort constants stay pinned like BUILD_TURN_DEADLINE_MS', () => {
  const budget = fs.readFileSync(new URL('./office-generation-budget.js', import.meta.url), 'utf8');
  const generateOffice = fs.readFileSync(new URL('../generate-office.ts', import.meta.url), 'utf8');
  const stream = fs.readFileSync(new URL('../../src/hooks/useChatStream.js', import.meta.url), 'utf8');
  const officeExport = fs.readFileSync(new URL('../../src/lib/office-export.js', import.meta.url), 'utf8');

  assert.match(budget, /OFFICE_PROXY_BUDGET_MS = 55_000/);
  assert.match(budget, /OFFICE_HOST_PROXY_LIMIT_MS = 60_000/);
  assert.match(budget, /OFFICE_MAX_ATTEMPTS = 1/);
  assert.match(budget, /OFFICE_MAX_FULL_PROVIDER_CALLS = 1/);
  assert.match(budget, /OFFICE_CLIENT_GENERATE_ABORT_MS = 58_000/);
  assert.match(budget, /OFFICE_CLIENT_COMPILE_ABORT_MS = 55_000/);
  assert.match(generateOffice, /shouldOfficeProviderFailover/);
  assert.match(generateOffice, /consultingGate: format === 'powerpoint' \? 'soft' : 'hard'/);
  assert.match(stream, /OFFICE_CLIENT_GENERATE_ABORT_MS/);
  assert.match(officeExport, /OFFICE_CLIENT_COMPILE_ABORT_MS/);
  assert.doesNotMatch(officeExport, /90_000/);
});
