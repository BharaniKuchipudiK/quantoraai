import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MONTHLY_CEILING_USD,
  decidePaidSpend,
  describeSpendState,
  estimateCallCostUsd,
  spendMonthKey,
} from './spend-ledger.js';

const KNOWN = { ledgerKnown: true, ceilingUsd: 50 };

test('an unreadable ledger refuses paid spend — unknown is never zero', () => {
  // The property that makes the budget real. A circuit breaker may guess when
  // its store is down; a spend meter may not.
  const decision = decidePaidSpend({ spentUsd: 0, estimatedCostUsd: 0.01, ledgerKnown: false });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'ledger-unavailable');
});

test('the ceiling actually refuses', () => {
  assert.equal(decidePaidSpend({ ...KNOWN, spentUsd: 50, estimatedCostUsd: 0.01 }).allowed, false);
  assert.equal(decidePaidSpend({ ...KNOWN, spentUsd: 50, estimatedCostUsd: 0.01 }).reason, 'ceiling-reached');
  assert.equal(decidePaidSpend({ ...KNOWN, spentUsd: 60, estimatedCostUsd: 0.01 }).remainingUsd, 0);
});

test('a call that would cross the ceiling is refused before it is made', () => {
  const decision = decidePaidSpend({ ...KNOWN, spentUsd: 49.99, estimatedCostUsd: 0.50 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'would-exceed-ceiling');
});

test('a call that cannot be priced is refused, not assumed free', () => {
  const decision = decidePaidSpend({ ...KNOWN, spentUsd: 0, estimatedCostUsd: null });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'cost-unknown');
});

test('no configured budget means no paid spend', () => {
  assert.equal(decidePaidSpend({ ledgerKnown: true, ceilingUsd: 0, estimatedCostUsd: 0.01 }).allowed, false);
});

test('a priceable call inside the ceiling is allowed', () => {
  const decision = decidePaidSpend({ ...KNOWN, spentUsd: 10, estimatedCostUsd: 0.25 });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'within-budget');
  assert.equal(decision.remainingUsd, 40);
});

test('cost comes from real token usage and live catalogue pricing', () => {
  // OpenRouter reports per-token USD rates on the model row.
  const cost = estimateCallCostUsd({
    promptTokens: 1000,
    completionTokens: 500,
    pricing: { prompt: '0.000001', completion: '0.000002' },
  });
  assert.ok(Math.abs(cost - 0.002) < 1e-9, `got ${cost}`);
});

test('missing or unparseable pricing yields null, never zero', () => {
  assert.equal(estimateCallCostUsd({ promptTokens: 1000, completionTokens: 500, pricing: {} }), null);
  assert.equal(estimateCallCostUsd({ promptTokens: 1000, completionTokens: 500, pricing: null }), null);
  assert.equal(estimateCallCostUsd({ promptTokens: 1000, completionTokens: 500, pricing: { prompt: 'x', completion: '0.1' } }), null);
  // and null must not be admitted as a free call
  assert.equal(decidePaidSpend({ ...KNOWN, estimatedCostUsd: null }).allowed, false);
});

test('a free model prices at zero and is allowed', () => {
  const cost = estimateCallCostUsd({ promptTokens: 9999, completionTokens: 9999, pricing: { prompt: '0', completion: '0' } });
  assert.equal(cost, 0);
  assert.equal(decidePaidSpend({ ...KNOWN, spentUsd: 0, estimatedCostUsd: cost }).allowed, true);
});

test('spend accumulates into a UTC calendar month bucket', () => {
  assert.equal(spendMonthKey(new Date('2026-08-25T12:00:00Z')), '2026-08');
  assert.equal(spendMonthKey(new Date('2026-01-01T00:00:00Z')), '2026-01');
  assert.equal(spendMonthKey(new Date('2026-12-31T23:59:59Z')), '2026-12');
  assert.match(spendMonthKey(), /^\d{4}-\d{2}$/);
});

test('the state is describable so a paid rescue is never silent', () => {
  assert.match(describeSpendState({ spentUsd: 12.5, ceilingUsd: 50, ledgerKnown: true }), /\$12\.50 of \$50\.00/);
  assert.match(describeSpendState({ ledgerKnown: false }), /cannot be measured/);
});

test('the default ceiling is the agreed 50 USD', () => {
  assert.equal(DEFAULT_MONTHLY_CEILING_USD, 50);
});
