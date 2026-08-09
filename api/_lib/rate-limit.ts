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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
 * Fails OPEN, deliberately. If the database is unreachable this returns
 * `false` — not rate limited — and the caller proceeds. The in-memory limiter
 * still applies underneath, so there is never no limit at all. The judgement:
 * a brief window of weaker limits during an outage is a smaller harm than
 * locking out every legitimate user because a counter table was unreachable.
 */
export async function isRateLimitedDurable(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ limited: boolean; hits: number | null; resetsAt: string | null }> {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return { limited: false, hits: null, resetsAt: null };

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
      return { limited: false, hits: null, resetsAt: null };
    }

    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { limited: false, hits: null, resetsAt: null };

    return {
      limited: row.allowed === false,
      hits: typeof row.hits === "number" ? row.hits : null,
      resetsAt: row.resets_at ?? null,
    };
  } catch (err: any) {
    console.warn("Durable rate limit check failed:", err?.message || err);
    return { limited: false, hits: null, resetsAt: null };
  }
}
