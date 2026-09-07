/**
 * The platform's own daily ceiling on Google Places.
 *
 * WHY A DAY, WHEN A MINUTE IS ALREADY LIMITED
 *
 * The chat turn — the only path to these tools — is already rate limited at
 * RATE_LIMIT_PER_MINUTE per user, durably and shared across instances, and
 * MAX_AGENT_STEPS holds a single turn to five tool calls. So the BURST is
 * bounded, and it is tempting to call that done.
 *
 * It is not the same question. Twenty-five turns a minute at five calls each is
 * 7,500 Places lookups an hour, every hour, and Places Text Search is among the
 * most expensive single calls this platform makes. A per-minute limit says how
 * FAST money can leave. It never says how much.
 *
 * That distinction cost this project a day on 2026-09-07. A Google Cloud BUDGET
 * is an alert and a QUOTA is a cap, and hours went into the first believing it
 * was the second. Google's postpay side — which is what bills Places, Maps and
 * Cloud Build — still has no hard stop of its own: it accrues against a payment
 * threshold. So the ceiling that stops a runaway on this surface has to be ours.
 *
 * UNSET IS A REAL NUMBER, NOT INFINITY. Inherited verbatim from
 * paid-route-gate.ts and user-paid-quota.ts, both of which state it, because
 * this platform has now twice shipped a protection that existed in the
 * repository and on no deployment.
 */
import {
  applyDurableCostBearingGuard,
  isRateLimitedDurable,
  type DurableRateResult,
} from "./rate-limit.js";

/** Every tool below reaches Google Places or Routes, and is charged per call. */
const PLACES_BACKED_TOOLS = new Set(["search_hotels", "search_attractions", "get_places_routing"]);

export function isPlacesBackedTool(name: unknown): boolean {
  return PLACES_BACKED_TOOLS.has(String(name || ""));
}

/**
 * Sized for a pilot, not for a runaway.
 *
 * Ten people using the travel desk heavily do not reach this in a day; a loop
 * reaches it in minutes. Operators should set PLACES_DAILY_CALL_CEILING
 * deliberately once real usage is measured — this is the floor under not
 * having, which is the state every ceiling in this repo was found in.
 */
export const DEFAULT_PLACES_DAILY_CALLS = 250;

const WINDOW_SECONDS = 24 * 60 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1_000;

/** Platform-wide, deliberately: this is the platform's bill, not one person's share. */
export const PLACES_DAILY_KEY = "places:day";

export function placesDailyCallCeiling(env: Record<string, string | undefined> = process.env): number {
  const raw = String(env.PLACES_DAILY_CALL_CEILING || "").trim();
  if (!raw) return DEFAULT_PLACES_DAILY_CALLS;
  const value = Number(raw);
  /*
   * Zero, negative and unparseable all fall back to the default. "0" meaning
   * "unlimited" would be a trap of exactly the shape this file exists to close.
   */
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_PLACES_DAILY_CALLS;
}

export interface PlacesDailyCapVerdict {
  reached: boolean;
  ceiling: number;
  /** True when the durable store was unreachable and the stricter in-memory bound decided. */
  degraded: boolean;
}

/**
 * FAILS THE WAY THE REST OF THE COST-BEARING ROUTES FAIL.
 *
 * Not a new policy: applyDurableCostBearingGuard already owns "what happens to
 * a paid route when Supabase is down", and its answer is a stricter
 * per-instance burst rather than an open door. Forking a second answer here is
 * how one of the two stops getting the next correction.
 */
export async function placesDailyCapVerdict({
  env = process.env,
  checkDurable = isRateLimitedDurable,
  applyGuard = applyDurableCostBearingGuard,
}: {
  env?: Record<string, string | undefined>;
  checkDurable?: (key: string, limit: number, windowSeconds: number) => Promise<DurableRateResult>;
  applyGuard?: typeof applyDurableCostBearingGuard;
} = {}): Promise<PlacesDailyCapVerdict> {
  const ceiling = placesDailyCallCeiling(env);
  const durable = await checkDurable(PLACES_DAILY_KEY, ceiling, WINDOW_SECONDS);
  const guard = applyGuard(PLACES_DAILY_KEY, ceiling, durable, WINDOW_MS);
  return { reached: guard.limited, ceiling, degraded: guard.degraded };
}

/**
 * What a person is told when the ceiling holds a lookup back.
 *
 * A silent failure here would read as "the travel desk is broken" and send
 * somebody debugging an API key that is working perfectly. It names the number,
 * the variable that sets it, and the fact that it is self-imposed — the three
 * things needed to decide whether to raise it.
 */
export function describePlacesDailyCap(verdict: PlacesDailyCapVerdict): string {
  return `Live place lookups are paused: this platform's own daily ceiling of `
    + `${verdict.ceiling} Google Places calls has been reached${verdict.degraded ? " (measured on a stricter fallback bound, because the durable counter was unreachable)" : ""}. `
    + `It resets within 24 hours. Raise PLACES_DAILY_CALL_CEILING to lift it. `
    + `Nothing else about the desk is affected — this limit covers live place lookups only.`;
}
