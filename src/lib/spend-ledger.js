/**
 * Spend meter — the control that makes a paid budget real rather than aspirational.
 *
 * Quantora had no cost accounting of any kind, so a "$50 ceiling" could only
 * ever have been a comment. This module is the meter, and it is deliberately
 * built and proven BEFORE any paid route is opened: a budget you cannot measure
 * is not a budget.
 *
 * The single most important property here is that it FAILS CLOSED. A circuit
 * breaker may degrade to a local guess when its store is unreachable, because
 * the worst case is a wasted retry. A spend meter may not: if we cannot read
 * what has already been spent, we must refuse paid routing rather than spend an
 * unknown amount. Unknown spend is never treated as zero spend.
 */

/** Ceiling used when none is configured. Overridable via env at the call site. */
export const DEFAULT_MONTHLY_CEILING_USD = 50;

/** Calendar month bucket the ledger accumulates into, e.g. "2026-08". */
export function spendMonthKey(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function perTokenRate(value) {
  const n = Number(value);
  // OpenRouter reports pricing as a per-token USD string. A missing or
  // unparseable rate must not silently price a call at zero.
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Cost of one call in USD from the provider's own token usage and the live
 * catalogue pricing. Returns null when either side is unknown — the caller must
 * treat null as "cannot price this", not as "free".
 */
export function estimateCallCostUsd({ promptTokens = 0, completionTokens = 0, pricing = null } = {}) {
  const promptRate = perTokenRate(pricing?.prompt);
  const completionRate = perTokenRate(pricing?.completion);
  if (promptRate === null || completionRate === null) return null;
  const inTokens = Math.max(0, Math.floor(Number(promptTokens) || 0));
  const outTokens = Math.max(0, Math.floor(Number(completionTokens) || 0));
  return inTokens * promptRate + outTokens * completionRate;
}

/**
 * May we spend on a paid route right now?
 *
 * @param {{
 *   spentUsd?: number,
 *   ceilingUsd?: number,
 *   estimatedCostUsd?: number|null,
 *   ledgerKnown?: boolean,
 * }} input
 * @returns {{ allowed: boolean, reason: string, remainingUsd: number }}
 */
export function decidePaidSpend({
  spentUsd = 0,
  ceilingUsd = DEFAULT_MONTHLY_CEILING_USD,
  estimatedCostUsd = null,
  ledgerKnown = false,
} = {}) {
  const ceiling = Math.max(0, Number(ceilingUsd) || 0);

  // Fail closed: an unreadable ledger is not a zero ledger.
  if (ledgerKnown !== true) {
    return { allowed: false, reason: 'ledger-unavailable', remainingUsd: 0 };
  }
  if (ceiling <= 0) {
    return { allowed: false, reason: 'no-budget-configured', remainingUsd: 0 };
  }

  const spent = Math.max(0, Number(spentUsd) || 0);
  const remainingUsd = Math.max(0, ceiling - spent);
  if (remainingUsd <= 0) {
    return { allowed: false, reason: 'ceiling-reached', remainingUsd: 0 };
  }

  // An unpriceable call cannot be admitted against a ceiling we must honour.
  const estimate = estimatedCostUsd === null || estimatedCostUsd === undefined
    ? null
    : Math.max(0, Number(estimatedCostUsd) || 0);
  if (estimate === null) {
    return { allowed: false, reason: 'cost-unknown', remainingUsd };
  }
  if (estimate > remainingUsd) {
    return { allowed: false, reason: 'would-exceed-ceiling', remainingUsd };
  }

  return { allowed: true, reason: 'within-budget', remainingUsd };
}

/** Human-readable line for the UI, so a paid rescue is never silent. */
export function describeSpendState({ spentUsd = 0, ceilingUsd = DEFAULT_MONTHLY_CEILING_USD, ledgerKnown = false } = {}) {
  if (ledgerKnown !== true) return 'Paid fallback is off — spend cannot be measured right now.';
  const ceiling = Math.max(0, Number(ceilingUsd) || 0);
  const spent = Math.min(Math.max(0, Number(spentUsd) || 0), ceiling);
  return `Paid fallback: $${spent.toFixed(2)} of $${ceiling.toFixed(2)} used this month.`;
}
