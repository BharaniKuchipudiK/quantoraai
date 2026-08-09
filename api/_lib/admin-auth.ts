import { timingSafeEqual } from "node:crypto";

/*
 * Admin authentication for the telemetry endpoints.
 *
 * This replaces a password ("quantora2026") that was hardcoded in the handler
 * AND in the client bundle shipped to every visitor — it appeared in plain
 * sight in devtools and provided no access control whatsoever.
 *
 * Two rules here, both deliberate:
 *
 * 1. FAIL CLOSED. If ADMIN_API_KEY is not configured, every request is denied.
 *    The tempting alternative — fall back to a default when the variable is
 *    missing — is exactly how a "temporary" default password ends up permanent
 *    in production. A misconfigured deployment should lock the operator out,
 *    not let the internet in.
 *
 * 2. Constant-time comparison. A plain === on a secret leaks it through
 *    timing: it returns at the first differing byte, so response time reveals
 *    how much of a guess was right, one character at a time. timingSafeEqual
 *    always reads both buffers fully.
 *
 * The key is read from a header, not a query string. Query strings land in
 * server logs, browser history, proxy logs and Referer headers — the previous
 * "?admin=..." form leaked the secret into all of them.
 */

/*
 * Returns null when the caller is authenticated, or a {status, error} object
 * describing the refusal.
 *
 * Deliberately not a discriminated union on an `ok` boolean: this project's
 * tsconfig does not enable `strict`, so without strictNullChecks TypeScript
 * widens the `true`/`false` literal types and cannot narrow the union at the
 * call site. A nullable failure object needs no narrowing to use safely.
 */
export type AdminAuthFailure = { status: number; error: string };

function extractPresentedKey(req: any): string | null {
  const header = req.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim() || null;
  }
  const headerKey = req.headers?.["x-admin-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();
  return null;
}

export function authenticateAdmin(req: any): AdminAuthFailure | null {
  const expected = process.env.ADMIN_API_KEY?.trim();

  // Also refuses a too-short key: a 6-character "secret" is guessable, and
  // configuring one should be an obvious failure rather than a silent weakness.
  if (!expected || expected.length < 16) {
    return {
      status: 503,
      error:
        "Telemetry unavailable: ADMIN_API_KEY is not configured on this deployment (minimum 16 characters).",
    };
  }

  const presented = extractPresentedKey(req);
  if (!presented) return { status: 401, error: "Unauthorized" };

  const presentedBuf = Buffer.from(presented, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on length mismatch, which would itself leak length,
  // so both are copied into equal-sized buffers and length is folded into the
  // result afterwards.
  const size = Math.max(presentedBuf.length, expectedBuf.length);
  const a = Buffer.alloc(size);
  const b = Buffer.alloc(size);
  presentedBuf.copy(a);
  expectedBuf.copy(b);

  const equal = timingSafeEqual(a, b) && presentedBuf.length === expectedBuf.length;
  if (!equal) return { status: 401, error: "Unauthorized" };

  return null;
}
