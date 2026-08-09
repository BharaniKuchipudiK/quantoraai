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
