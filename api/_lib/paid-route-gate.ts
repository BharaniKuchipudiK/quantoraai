/**
 * The brake on paid routing — read from the provider's own meter.
 *
 * WHY THIS EXISTS
 *
 * The cost-control subsystem was written, tested, and connected to nothing:
 * recordModelSpend, readMonthlySpend, canOfferPaidLastResort, decidePaidSpend,
 * estimateCallCostUsd and describeSpendState all had zero callers. So the
 * platform could not see what it spent and could not refuse a paid call when
 * the float was gone. Every budget conversation was unenforceable.
 *
 * WHY NOT THE TOKEN LEDGER
 *
 * estimateCallCostUsd wants promptTokens and completionTokens. Nothing in the
 * streaming path ever captured them — that is the real reason the meter was
 * dead, not a missing import. Building that accounting means our arithmetic
 * against a catalogue price, which drifts from what is actually charged.
 *
 * OpenRouter publishes the real number at /auth/key: `usage` is what this key
 * has actually spent and `limit` is its ceiling. Using the provider's own meter
 * is both less code and more truthful than reconstructing it.
 *
 * FAILS CLOSED
 *
 * If the meter cannot be read, paid routing is REFUSED. A circuit breaker may
 * guess when its store is unreachable — the worst case is a wasted retry. A
 * spend gate may not: unknown spend is never treated as zero spend. That rule
 * is inherited verbatim from spend-ledger, which stated it and was then never
 * wired up to enforce it.
 */
import { checkOpenRouterKey } from "./openrouter-probe.js";

export interface PaidRouteVerdict {
  allowed: boolean;
  reason: string;
  spentUsd: number | null;
  limitUsd: number | null;
  remainingUsd: number | null;
}

/** Stop before the account is actually empty, so a turn in flight can finish. */
export const RESERVE_USD = 1;

/** Cached briefly: a chat turn must not add a round trip to OpenRouter. */
const TTL_MS = 60_000;
let cache: { at: number; key: string; verdict: PaidRouteVerdict } | null = null;

export function decidePaidRoute(auth: {
  ok: boolean;
  usage: number | null;
  limit: number | null;
  isFreeTier?: boolean | null;
}): PaidRouteVerdict {
  if (!auth?.ok) {
    return { allowed: false, reason: "the spend meter could not be read", spentUsd: null, limitUsd: null, remainingUsd: null };
  }
  const spentUsd = typeof auth.usage === "number" ? auth.usage : null;
  const limitUsd = typeof auth.limit === "number" ? auth.limit : null;

  /*
   * A null limit means the account is uncapped, not that nothing is left. That
   * distinction already cost this repo once: remaining was computed as
   * (limit - usage) and a null limit would have read as a negative balance.
   */
  if (limitUsd === null) {
    return { allowed: true, reason: "no ceiling set on this key", spentUsd, limitUsd: null, remainingUsd: null };
  }
  if (spentUsd === null) {
    return { allowed: false, reason: "the provider did not report spend", spentUsd: null, limitUsd, remainingUsd: null };
  }

  const remainingUsd = Number((limitUsd - spentUsd).toFixed(4));
  if (remainingUsd <= RESERVE_USD) {
    return {
      allowed: false,
      reason: `$${remainingUsd.toFixed(2)} left of $${limitUsd.toFixed(2)} — paid routes are held back so free ones keep working`,
      spentUsd,
      limitUsd,
      remainingUsd,
    };
  }
  return { allowed: true, reason: `$${remainingUsd.toFixed(2)} of $${limitUsd.toFixed(2)} remaining`, spentUsd, limitUsd, remainingUsd };
}

/** The live verdict for this key. Never throws: an error is a refusal. */
export async function paidRouteAllowed(
  key: string | null | undefined,
  { now = Date.now(), fetchFn }: { now?: number; fetchFn?: typeof fetch } = {},
): Promise<PaidRouteVerdict> {
  const token = String(key || "");
  if (!token) {
    return { allowed: false, reason: "no OpenRouter credential", spentUsd: null, limitUsd: null, remainingUsd: null };
  }
  if (cache && cache.key === token && now - cache.at < TTL_MS) return cache.verdict;
  try {
    const auth = await checkOpenRouterKey(token, fetchFn ? { fetchFn } : undefined);
    const verdict = decidePaidRoute(auth);
    /*
     * Only a READ verdict is cached. checkOpenRouterKey swallows its own
     * network errors and returns ok:false, so caching every verdict would pin
     * paid routing off for a minute after a single blip — the failure my own
     * test caught here. A refusal we could not verify is re-checked next turn.
     */
    if (auth?.ok) cache = { at: now, key: token, verdict };
    return verdict;
  } catch {
    // Deliberately not cached: a transient failure must not lock paid routing
    // off for a minute, and must not turn into a silent allow either.
    return { allowed: false, reason: "the spend meter could not be reached", spentUsd: null, limitUsd: null, remainingUsd: null };
  }
}

/** Reset between tests. */
export function resetPaidRouteCache(): void {
  cache = null;
}

/**
 * What to tell a person when the paid rung is withheld.
 *
 * A silent downgrade is the defect this repo keeps deleting: the turn quietly
 * runs on a weaker model, the result is worse, and nothing says why. Naming the
 * number turns "it got dumber" into a fact the operator can act on.
 *
 * Returns '' when paid is allowed — nothing to explain.
 */
export function describePaidHold(verdict: PaidRouteVerdict | null): string {
  if (!verdict || verdict.allowed) return "";
  if (verdict.remainingUsd !== null && verdict.limitUsd !== null) {
    return `Premium models are paused: $${verdict.remainingUsd.toFixed(2)} left of `
      + `$${verdict.limitUsd.toFixed(2)} this month. Free routes still work, and `
      + `they built the calculator and the storefront. Raise the ceiling on the `
      + `OpenRouter key to bring premium back.`;
  }
  return `Premium models are paused — ${verdict.reason}. Free routes still work.`;
}
