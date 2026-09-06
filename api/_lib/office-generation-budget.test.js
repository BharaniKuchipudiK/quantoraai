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
  describeOfficeProviderOutcome,
  officeFailoverRefusalReason,
  officeGenerationMaxAttempts,
  officeModelCallBudgetMs,
  officeProviderOrder,
  officeTimeoutUserMessage,
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

test('the failover refusal reason is the failover decision, in words', () => {
  const cases = [
    { providersTried: 0, remainingMs: 40_000 },
    { providersTried: 1, firstElapsedMs: OFFICE_FAST_FAILOVER_MS - 1, remainingMs: 40_000 },
    { providersTried: 1, firstElapsedMs: 20_000, remainingMs: 40_000 },
    { providersTried: 1, firstElapsedMs: 1_000, remainingMs: 10_000 },
    { providersTried: 2, firstElapsedMs: 500, remainingMs: 40_000 },
  ];
  for (const input of cases) {
    assert.equal(officeFailoverRefusalReason(input) === null, shouldOfficeProviderFailover(input), JSON.stringify(input));
  }
  assert.match(officeFailoverRefusalReason({ providersTried: 1, firstElapsedMs: 20_000, remainingMs: 40_000 }), /first miss took 20s/);
  assert.match(officeFailoverRefusalReason({ providersTried: 1, firstElapsedMs: 1_000, remainingMs: 10_000 }), /10s of host clock remained/);
  assert.match(officeFailoverRefusalReason({ providersTried: 2, firstElapsedMs: 500, remainingMs: 40_000 }), /one failover per attempt/);
});

test('a provider outcome names every provider asked and why the rest were not', () => {
  assert.equal(describeOfficeProviderOutcome({ failures: ['anthropic: Anthropic HTTP 401'] }), 'anthropic: Anthropic HTTP 401');
  assert.equal(
    describeOfficeProviderOutcome({
      failures: ['anthropic: Anthropic HTTP 401'],
      untried: ['gemini', 'openrouter'],
      refusal: 'the first miss took 21s and only a miss under 8s may fail over',
    }),
    'anthropic: Anthropic HTTP 401 — gemini, openrouter not asked: the first miss took 21s and only a miss under 8s may fail over',
  );
  assert.equal(
    describeOfficeProviderOutcome({ failures: ['gemini: 429 quota', 'openrouter: Missing Authentication header'] }),
    'gemini: 429 quota | openrouter: Missing Authentication header',
  );
  assert.equal(describeOfficeProviderOutcome({}), 'no provider was asked');
});
