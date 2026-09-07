/*
 * Best-effort in-memory rate limiting and origin checks for Vercel
 * serverless functions.
 *
 * Vercel functions are stateless across cold starts and may run as several
 * concurrent instances, so a Map kept in module scope is not a hard
 * guarantee the way a shared store (Upstash / Vercel KV) would be — a burst
 * of requests spread across cold instances can each get their own fresh
 * counter. It still meaningfully raises the bar against casual abuse on a
 * warm container, costs nothing to add, and is strictly better than the
 * "no limit at all" this replaces. Swap in a shared store before this app
 * has real traffic you're relying on this to protect.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Reset between tests.
 *
 * The Map is module scope, and a limiter with a 24-hour window outlives the
 * suite that trips it: without this, one test proving a ceiling holds leaves
 * every later test in the same process on the wrong side of it.
 */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

export function clientIp(req: { headers?: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

/*
 * Sets CORS headers only for a request whose Origin matches APP_URL.
 * Same-origin requests from this app's own frontend never need CORS headers
 * at all — the browser only enforces CORS on cross-origin calls — so leaving
 * APP_URL unset or mismatched blocks cross-origin callers without affecting
 * the app's own UI. This replaces the previous unconditional
 * Access-Control-Allow-Origin: '*' + Allow-Credentials: 'true', a spec-
 * invalid combination that also let any site on the internet call these
 * endpoints as an anonymous proxy to the server's own API keys.
 */
export function applyCors(
  req: { headers?: Record<string, unknown> },
  res: { setHeader: (name: string, value: string) => void },
  methods = "POST,OPTIONS",
) {
  const allowedOrigin = process.env.APP_URL;
  const requestOrigin = req.headers?.origin;

  if (allowedOrigin && typeof requestOrigin === "string" && requestOrigin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Quantora-Correlation-Id, X-Quantora-Golden-Canary, X-Quantora-Gemini-Key, X-Quantora-OpenRouter-Key, X-Quantora-Anthropic-Key",
  );
}

export type DurableRateResult = {
  limited: boolean;
  hits: number | null;
  resetsAt: string | null;
  /**
   * True when the shared store was missing or unreachable. Cost-bearing callers
   * should tighten the local limit via applyDurableCostBearingGuard rather than
   * treating this as a full pass.
   */
  unavailable: boolean;
};

/*
 * Durable rate limiting, backed by Postgres.
 *
 * isRateLimited above keeps counters in a module-scope Map, which on Vercel is
 * per-instance and per-cold-start: concurrent functions each get a fresh
 * allowance, and a restart forgets everything. Fine as a speed bump, useless
 * as a guarantee.
 *
 * This asks the database instead, where a single row per (key, window) is
 * shared by every instance and survives restarts. The increment and the check
 * happen in one statement inside hit_rate_limit, so two requests arriving
 * together cannot both read the same count and both conclude they are under
 * the limit.
 *
 * When the database is unreachable this returns limited:false with
 * unavailable:true. Non-cost routes may still proceed under the in-memory
 * limiter. Cost-bearing routes (chat, Office, enhance, …) must call
 * applyDurableCostBearingGuard so a Supabase outage collapses to a stricter
 * per-instance burst instead of an open door.
 */
export async function isRateLimitedDurable(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<DurableRateResult> {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return { limited: false, hits: null, resetsAt: null, unavailable: true };

  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/hit_rate_limit`, {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_s: windowSeconds }),
      // Short: a rate-limit check must never become the slowest part of a request.
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      console.warn("Durable rate limit unavailable:", response.status, await response.text());
      return { limited: false, hits: null, resetsAt: null, unavailable: true };
    }

    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { limited: false, hits: null, resetsAt: null, unavailable: true };

    return {
      limited: row.allowed === false,
      hits: typeof row.hits === "number" ? row.hits : null,
      resetsAt: row.resets_at ?? null,
      unavailable: false,
    };
  } catch (err: any) {
    console.warn("Durable rate limit check failed:", err?.message || err);
    return { limited: false, hits: null, resetsAt: null, unavailable: true };
  }
}

/** In-memory ceiling while the durable store is down: ~1/3 of the normal budget. */
export function degradedRateLimit(normalLimit: number): number {
  return Math.max(1, Math.ceil(normalLimit / 3));
}

/**
 * After isRateLimitedDurable, apply this on cost-bearing routes so an outage
 * does not reopen full quota on every warm instance.
 */
export function applyDurableCostBearingGuard(
  key: string,
  normalLimit: number,
  durable: DurableRateResult,
  windowMs = 60_000,
): { limited: boolean; resetsAt: string | null; degraded: boolean } {
  if (durable.limited) {
    return { limited: true, resetsAt: durable.resetsAt, degraded: false };
  }
  if (
    durable.unavailable &&
    isRateLimited(`${key}:degraded`, degradedRateLimit(normalLimit), windowMs)
  ) {
    return { limited: true, resetsAt: null, degraded: true };
  }
  return { limited: false, resetsAt: null, degraded: false };
}
