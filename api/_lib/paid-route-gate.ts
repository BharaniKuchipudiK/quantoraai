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
import { describeCredentialFailure, isOutOfCredit, isProviderCredentialRejection } from "./model-execution-policy.js";

/**
 * WHY THE METER'S FAILURE HAS TO BE CARRIED, NOT SUMMARISED
 *
 * decidePaidRoute was typed `{ ok, usage, limit }` while its caller handed it
 * the whole OpenRouterAuthResult — which also carries `status` and the scrubbed
 * provider text. A narrower parameter type silently dropped both, so a rejected
 * key, an empty balance, a rate limit and an 8-second timeout all came out of
 * this function as the same eleven words: "the spend meter could not be read".
 *
 * That is what /api/inference-health reported in production on 2026-09-04, and
 * it is unactionable by construction — nobody can tell from it whether to
 * re-issue a key, top up an account, or wait.
 *
 * IT IS NOT MERELY A DIAGNOSTIC. /auth/key authenticates the same credential
 * every OpenRouter call uses, FREE MODELS INCLUDED. So a meter that cannot be
 * read because the key was rejected is also a gateway on which nothing will
 * run — while `openRouterConfigured: true` and `routeCount: 3` keep saying
 * otherwise, because both are computed from the SHAPE OF A STRING.
 *
 * The vocabulary here is deliberately not new. isProviderCredentialRejection /
 * isOutOfCredit / describeCredentialFailure already exist and already carry the
 * lesson that 402 is a wallet and 401 is a key; forking a second taxonomy is
 * how one of them stops getting the next correction.
 */
export type PaidMeterFaultCause =
  | "CREDENTIAL_REJECTED"
  | "NO_CREDIT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "METER_UNREACHABLE";

export type PaidMeterFault = {
  cause: PaidMeterFaultCause;
  status: number | null;
  /** The provider's own words, already key-scrubbed by openrouter-probe. */
  detail: string;
  remedy: string;
  /** Does this fault also stop FREE models on the same gateway? */
  gatewayDead: boolean;
};

export interface PaidRouteVerdict {
  allowed: boolean;
  reason: string;
  spentUsd: number | null;
  limitUsd: number | null;
  remainingUsd: number | null;
  /** Present exactly when the meter could not be read. Never null on a refusal
   *  that has no spend figures to explain itself with. */
  meterFault: PaidMeterFault | null;
}

/**
 * WHOSE MONEY THIS KEY SPENDS.
 *
 * 'server' is a credential the platform owns and is billed for — the env var
 * or the Supabase gateway row. 'user' is a key somebody brought themselves.
 *
 * The distinction is load-bearing because of what sits below it. The platform's
 * ceiling is a limit on the PLATFORM's spend; measuring somebody else's key
 * against it refuses paid routes to the one person who is definitely paying for
 * them. A BYOK key carrying $49 of its owner's own lifetime usage would be held
 * back by a $50 platform ceiling that has nothing to do with their account —
 * and the number they would be told to raise is not a number they can see.
 *
 * The vocabulary is deliberately not new: planInferenceRoutes already takes
 * openRouterCredentialScope: 'user' | 'server', computed from this same fact a
 * few lines from this gate's caller. Forking a second taxonomy is how one of
 * them stops getting the next correction.
 */
export type PaidCredentialScope = "server" | "user";

/**
 * Classify what the provider actually said.
 *
 * ORDER IS LOAD-BEARING, and for a reason this repo has already paid for once
 * today: isProviderCredentialRejection groups 401, 402 and 403 — correct for
 * routing, wrong for the sentence a human reads. 402 must be tested FIRST or an
 * empty wallet is reported as a bad key and somebody goes and re-issues a
 * credential that was working.
 */
export function classifyMeterFault(auth: {
  status?: number | null;
  error?: string | null;
}): PaidMeterFault {
  const status = typeof auth?.status === "number" ? auth.status : null;
  const detail = String(auth?.error || "").trim() || (status ? `HTTP ${status}` : "no response from the meter");
  const probe = { status: status || 0, message: detail };

  if (isOutOfCredit(probe)) {
    return {
      cause: "NO_CREDIT",
      status,
      detail,
      remedy: describeCredentialFailure(probe),
      // 402 is charged per call: free models are still served on an empty balance.
      gatewayDead: false,
    };
  }
  if (isProviderCredentialRejection(probe)) {
    return {
      cause: "CREDENTIAL_REJECTED",
      status,
      detail,
      remedy: describeCredentialFailure(probe),
      /*
       * The whole gateway, not just the paid rung. /auth/key is the same
       * credential a ":free" model presents, so a key OpenRouter refuses here
       * cannot run one either — which is why a turn can fail on a free model
       * while readiness still counts it as a route.
       */
      gatewayDead: true,
    };
  }
  if (status === 429) {
    return {
      cause: "RATE_LIMITED",
      status,
      detail,
      remedy: "OpenRouter is rate limiting this key at the auth call, before any generation. "
        + "The account is over its request quota; paid routing resumes when the window resets.",
      gatewayDead: false,
    };
  }
  if (status !== null) {
    return {
      cause: "PROVIDER_ERROR",
      status,
      detail,
      remedy: `OpenRouter answered the spend check with HTTP ${status}. Paid routing stays off until it answers `
        + "normally — this is the provider's side, not a key and not a balance.",
      gatewayDead: false,
    };
  }
  return {
    cause: "METER_UNREACHABLE",
    status: null,
    detail,
    remedy: "The spend check never reached OpenRouter (network failure or timeout), so spend is unknown "
      + "and paid routing fails closed. Free routes are unaffected.",
    gatewayDead: false,
  };
}

/** Stop before the account is actually empty, so a turn in flight can finish. */
export const RESERVE_USD = 1;

/** Cached briefly: a chat turn must not add a round trip to OpenRouter. */
const TTL_MS = 60_000;
/*
 * Identified by the credential AND whose it is, because the same token can be
 * presented both ways — a user pasting the platform's own key as their BYOK
 * credential — and the two verdicts genuinely differ, since only one of them is
 * measured against the platform's ceiling. With the scope left out of the cache
 * identity, whichever arrived first would answer for the other for a minute.
 */
let cache: { at: number; key: string; scope: PaidCredentialScope; verdict: PaidRouteVerdict } | null = null;

/**
 * THE PLATFORM'S OWN CEILING (2026-09-06).
 *
 * The production OpenRouter key carries no limit on the provider's side, so
 * the meter read "$29.19 spent, no ceiling set on this key" and paid routes
 * were always allowed — the platform had no number of its own to stop at.
 * OPENROUTER_SPEND_CEILING_USD is that number. It caps the key's own limit
 * when both exist and stands in when the key has none; the reserve logic
 * below then applies to whichever is lower. Unset, blank or not a positive
 * number means no ceiling, exactly as before.
 */
/**
 * The ceiling that applies when nobody has set one.
 *
 * WHY THIS IS A NUMBER AND NOT `null`.
 *
 * It was null, and the comment above explains what that cost: the key carried
 * no limit on the provider's side either, so the meter read "$29.19 spent, no
 * ceiling set on this key" and every paid route was allowed. The protection
 * existed in this file and on no deployment -- exactly the failure
 * user-paid-quota.ts already refused to repeat: "an unset limit is a real
 * default, not infinity, and a test holds that."
 *
 * The shape of the harm is not hypothetical and not ours alone. A runaway loop
 * or a bad retry does not spend gently: it spends at machine speed, and the
 * first anyone hears of it is the invoice. A ceiling that must be remembered
 * is not a ceiling.
 *
 * $50 is chosen to be boring: comfortably above this key's lifetime spend, so
 * arming it changes nothing about a normal day, and low enough that a runaway
 * stops at a number a pre-revenue platform can absorb. It is a LIFETIME figure,
 * because OpenRouter's meter reports lifetime usage on the key -- not a monthly
 * allowance. Operators should set OPENROUTER_SPEND_CEILING_USD deliberately;
 * this is the floor under forgetting to.
 *
 * IT APPLIES TO THE PLATFORM'S OWN CREDENTIAL ONLY. See PaidCredentialScope:
 * this number is a limit on what THIS platform spends, so charging it against a
 * key somebody brought themselves would refuse paid routes to the one person
 * who is definitely paying for them.
 */
export const DEFAULT_PLATFORM_SPEND_CEILING_USD = 50;

export function platformSpendCeilingUsd(env: Record<string, string | undefined> = process.env): number | null {
  const raw = String(env.OPENROUTER_SPEND_CEILING_USD || "").trim();
  if (!raw) return DEFAULT_PLATFORM_SPEND_CEILING_USD;
  const value = Number(raw);
  /*
   * A blank, zero, negative or unparseable value is somebody trying to say
   * something and failing, not somebody asking for no limit. Falling back to
   * the default is the safe reading; "0" meaning "unlimited" would be a trap.
   */
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PLATFORM_SPEND_CEILING_USD;
}

export function decidePaidRoute(auth: {
  ok: boolean;
  usage: number | null;
  limit: number | null;
  isFreeTier?: boolean | null;
  /* Carried, not summarised. These two are why the refusal below is actionable. */
  status?: number | null;
  error?: string | null;
}, { ceilingUsd = null }: { ceilingUsd?: number | null } = {}): PaidRouteVerdict {
  if (!auth?.ok) {
    const meterFault = classifyMeterFault(auth || {});
    return {
      allowed: false,
      // The old text stopped here, at eleven words that named nothing.
      reason: `the spend meter could not be read — ${meterFault.detail}`,
      spentUsd: null,
      limitUsd: null,
      remainingUsd: null,
      meterFault,
    };
  }
  const spentUsd = typeof auth.usage === "number" ? auth.usage : null;
  const keyLimitUsd = typeof auth.limit === "number" ? auth.limit : null;
  const platformCeiling = typeof ceilingUsd === "number" && Number.isFinite(ceilingUsd) && ceilingUsd > 0 ? ceilingUsd : null;
  const limitUsd = platformCeiling === null
    ? keyLimitUsd
    : keyLimitUsd === null ? platformCeiling : Math.min(keyLimitUsd, platformCeiling);
  const ceilingWord = platformCeiling !== null && (keyLimitUsd === null || platformCeiling <= keyLimitUsd)
    ? " (the platform's own ceiling)"
    : "";

  /*
   * A null limit means the account is uncapped, not that nothing is left. That
   * distinction already cost this repo once: remaining was computed as
   * (limit - usage) and a null limit would have read as a negative balance.
   */
  if (limitUsd === null) {
    return { allowed: true, reason: "no ceiling set on this key, and none set by the platform (OPENROUTER_SPEND_CEILING_USD)", spentUsd, limitUsd: null, remainingUsd: null, meterFault: null };
  }
  if (spentUsd === null) {
    /*
     * The meter READ fine and the account is capped — this is not a fault of the
     * provider's, so it carries no meterFault. It still may not pass silently:
     * the reason names exactly what is missing.
     */
    return { allowed: false, reason: "the meter answered with a limit but no spend figure", spentUsd: null, limitUsd, remainingUsd: null, meterFault: null };
  }

  const remainingUsd = Number((limitUsd - spentUsd).toFixed(4));
  if (remainingUsd <= RESERVE_USD) {
    return {
      allowed: false,
      reason: `$${remainingUsd.toFixed(2)} left of $${limitUsd.toFixed(2)}${ceilingWord} — paid routes are held back so free ones keep working`,
      spentUsd,
      limitUsd,
      remainingUsd,
      meterFault: null,
    };
  }
  return { allowed: true, reason: `$${remainingUsd.toFixed(2)} of $${limitUsd.toFixed(2)}${ceilingWord} remaining`, spentUsd, limitUsd, remainingUsd, meterFault: null };
}

/**
 * The live verdict for this key. Never throws: an error is a refusal.
 *
 * `credentialScope` is REQUIRED and deliberately has no default, because both
 * possible defaults are wrong in a way that hides. 'server' would silently
 * measure a future BYOK path against the platform's ceiling and refuse a
 * paying user. 'user' would silently drop the brake from a future platform
 * path — which is the exact failure this gate exists to prevent, and the one
 * whose first symptom is an invoice. Making the compiler ask the question at
 * every call site costs less than either.
 */
export async function paidRouteAllowed(
  key: string | null | undefined,
  { credentialScope, now = Date.now(), fetchFn }:
    { credentialScope: PaidCredentialScope; now?: number; fetchFn?: typeof fetch },
): Promise<PaidRouteVerdict> {
  const token = String(key || "");
  if (!token) {
    return {
      allowed: false,
      reason: "no OpenRouter credential",
      spentUsd: null,
      limitUsd: null,
      remainingUsd: null,
      meterFault: {
        cause: "METER_UNREACHABLE",
        status: null,
        detail: "no OpenRouter credential was resolved from the environment or the gateway",
        remedy: "Set OPENROUTER_API_KEY in the server environment, or store it in the Supabase API gateway. "
          + "Nothing on the OpenRouter side of the ladder can run without it.",
        gatewayDead: true,
      },
    };
  }
  if (cache && cache.key === token && cache.scope === credentialScope && now - cache.at < TTL_MS) return cache.verdict;
  try {
    const auth = await checkOpenRouterKey(token, fetchFn ? { fetchFn } : undefined);
    /*
     * The platform's ceiling binds the platform's credential, and nothing else.
     * On a key the user brought, the authority on what is left is that key's own
     * limit — which the meter already reports, from their account.
     */
    const ceilingUsd = credentialScope === "server" ? platformSpendCeilingUsd() : null;
    const verdict = decidePaidRoute(auth, { ceilingUsd });
    /*
     * Cached when the PROVIDER ANSWERED, not merely when it approved.
     *
     * The rule was "only a read verdict is cached", because checkOpenRouterKey
     * swallows its own network errors and returns ok:false — caching every
     * verdict would pin paid routing off for a minute after a single blip, a
     * failure this file's own test caught. That reasoning is about refusals we
     * COULD NOT VERIFY, and it is kept: a thrown request, a timeout and any
     * result with no status still re-check next turn.
     *
     * A refusal carrying a status is a different thing. OpenRouter was reached
     * and said no, in so many words. Re-asking it on every single turn adds an
     * 8-second round trip to a question already answered — and now that a
     * rejected credential also narrows routing, that probe sits on the path the
     * user is waiting for. One minute is the same staleness the allow branch
     * has always accepted, so a key repaired in the dashboard is picked up
     * within the same window, with no redeploy.
     */
    if (auth?.ok || typeof auth?.status === "number") cache = { at: now, key: token, scope: credentialScope, verdict };
    return verdict;
  } catch {
    // Deliberately not cached: a transient failure must not lock paid routing
    // off for a minute, and must not turn into a silent allow either.
    return {
      allowed: false,
      reason: "the spend meter could not be reached",
      spentUsd: null,
      limitUsd: null,
      remainingUsd: null,
      meterFault: classifyMeterFault({ status: null, error: "the spend check threw before the provider answered" }),
    };
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
  /*
   * "Free routes still work" was asserted unconditionally, and for the one
   * fault that matters most it is FALSE: a credential OpenRouter refuses at
   * /auth/key is the same credential a ":free" model presents. Telling somebody
   * their free routes are fine while every OpenRouter turn dies is worse than
   * saying nothing — it sends them to look at the wrong provider.
   */
  if (verdict.meterFault) {
    /*
     * Every remedy already ends with its own scope sentence — describeCredentialFailure
     * says "Providers other than OpenRouter are unaffected", the rest say their own.
     * Appending a second one produced "Free routes are unaffected. Free routes still
     * work.", so exactly one clause is added here, and only for the case no remedy
     * covers: this fault takes the free rung down with it.
     */
    return verdict.meterFault.gatewayDead
      ? `Premium models are paused — ${verdict.meterFault.remedy} This also stops every FREE OpenRouter model, `
        + `because they present the same credential.`
      : `Premium models are paused — ${verdict.meterFault.remedy}`;
  }
  return `Premium models are paused — ${verdict.reason}. Free routes still work.`;
}
