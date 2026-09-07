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
import { PHOTO_LIMIT } from "./places-photos.js";
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
 * REQUESTS, NOT LOOKUPS — and the difference is a factor of five.
 *
 * The first version of this file counted one tool invocation as one unit and
 * called the result a ceiling on Places calls. It was not. A single
 * search_hotels resolves photos through resolvePhotoUri, and each photo is its
 * own billed request to places.googleapis.com: one text search plus up to
 * PHOTO_LIMIT media requests. A "ceiling of 250" therefore permitted 1,250
 * requests, and Google bills the second number.
 *
 * That is this repo's own lesson about tool descriptions, turned on one of its
 * gates: a promise the implementation does not keep does not merely fail to
 * protect, it makes everyone downstream reason from a number that was never
 * true. Found in review on 2026-09-07, before merge.
 *
 * So the unit here is one GOOGLE REQUEST, which is the unit Google charges.
 */
export const DEFAULT_PLACES_DAILY_REQUESTS = 500;

/**
 * The most requests one lookup can spend: the text search, plus one media
 * request per photo it resolves.
 *
 * Derived from PHOTO_LIMIT rather than written as a literal, so raising the
 * photo count cannot silently multiply the real ceiling while this file goes on
 * claiming the old one. A test holds the two together.
 */
export const MAX_REQUESTS_PER_LOOKUP = 1 + PHOTO_LIMIT;

const WINDOW_SECONDS = 24 * 60 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1_000;

/** Platform-wide, deliberately: this is the platform's bill, not one person's share. */
export const PLACES_DAILY_KEY = "places:day";

export function placesDailyRequestCeiling(env: Record<string, string | undefined> = process.env): number {
  const raw = String(env.PLACES_DAILY_REQUEST_CEILING || "").trim();
  if (!raw) return DEFAULT_PLACES_DAILY_REQUESTS;
  const value = Number(raw);
  /*
   * Zero, negative and unparseable all fall back to the default. "0" meaning
   * "unlimited" would be a trap of exactly the shape this file exists to close.
   */
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_PLACES_DAILY_REQUESTS;
}

/**
 * How many lookups that request ceiling buys — every one priced at its worst case.
 *
 * hit_rate_limit increments by exactly one and takes no weight, and adding a
 * migration is not available: two are already written and unapplied, so a
 * protection that needed a third would exist in this repository and on no
 * deployment, which is the failure this file was written to stop repeating.
 *
 * Scaling the LIMIT rather than the count is the bound that survives that
 * constraint. It is deliberately conservative in two ways, both stated rather
 * than hidden: a lookup that resolved two photos is still charged for five, and
 * get_places_routing, which spends exactly one request, is charged five as
 * well. A money gate that over-counts stops early; one that under-counts does
 * not stop at all.
 */
export function placesDailyLookupAllowance(env: Record<string, string | undefined> = process.env): number {
  return Math.max(1, Math.floor(placesDailyRequestCeiling(env) / MAX_REQUESTS_PER_LOOKUP));
}

export interface PlacesDailyCapVerdict {
  reached: boolean;
  /** The ceiling in GOOGLE REQUESTS — the unit Google bills. */
  ceiling: number;
  /** Lookups that ceiling buys, each priced at its worst case. */
  lookups: number;
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
  const ceiling = placesDailyRequestCeiling(env);
  const lookups = placesDailyLookupAllowance(env);
  const durable = await checkDurable(PLACES_DAILY_KEY, lookups, WINDOW_SECONDS);
  const guard = applyGuard(PLACES_DAILY_KEY, lookups, durable, WINDOW_MS);
  return { reached: guard.limited, ceiling, lookups, degraded: guard.degraded };
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
    + `${verdict.ceiling} Google Places requests has been reached${verdict.degraded ? " (measured on a stricter fallback bound, because the durable counter was unreachable)" : ""}. `
    + `That is ${verdict.lookups} lookups, because one lookup spends up to ${MAX_REQUESTS_PER_LOOKUP} requests — the search plus a photo each. `
    + `It resets within 24 hours. Raise PLACES_DAILY_REQUEST_CEILING to lift it. `
    + `Nothing else about the desk is affected — this limit covers live place lookups only.`;
}
