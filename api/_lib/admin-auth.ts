import { timingSafeEqual } from "node:crypto";
import { getSessionUser } from "./session.js";
import { isAdminUser } from "./store.js";

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

/*
 * Admin access, decided by who is signed in.
 *
 * The dashboard used to require ADMIN_API_KEY — a second secret for a person
 * the server had already authenticated. That was redundant the moment Google
 * sign-in became real, and it locked the operator out twice: once through a
 * trailing newline on the stored value, once because the key entry screen was
 * removed while the check remained.
 *
 * Now: if the signed-in account is flagged is_admin, that is sufficient. There
 * is nothing to paste and nothing to lose, and access can always be restored
 * from the Supabase table editor by whoever owns the database.
 *
 * ADMIN_API_KEY still works when configured, for curl and scripts that have no
 * session. It is no longer required, and no longer the primary path.
 */
export async function authenticateAdminRequest(req: any): Promise<AdminAuthFailure | null> {
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    const admin = await isAdminUser(sessionUser.sub);
    if (admin === true) return null;
    if (admin === false) {
      return {
        status: 403,
        error: "This account is not an administrator. Set is_admin on your row in the users table to grant access.",
      };
    }
    // admin === null: the store could not answer. Fall through to the key.
  }

  const keyFailure = authenticateAdmin(req);
  if (!keyFailure) return null;

  // Without a session and without a key, say which is missing rather than
  // returning a bare 401 that explains nothing.
  if (!sessionUser) {
    return { status: 401, error: "Sign in to Quantora, or present an admin API key." };
  }
  return keyFailure;
}

export function authenticateAdmin(req: any): AdminAuthFailure | null {
  /*
   * Both sides are trimmed. This was the bug that caused the lockout.
   *
   * The presented key was trimmed and the expected one was not, so a single
   * trailing newline or space on the Vercel environment variable — trivially
   * easy when pasting a generated key — made every correct key mismatch, with
   * no way to tell from the outside that the key was right and the whitespace
   * was wrong. That is a bad failure: indistinguishable from a wrong password,
   * and unfixable by the person typing it.
   *
   * Trimming the stored value costs nothing. No legitimate secret depends on
   * leading or trailing whitespace.
   */
  const expected = process.env.ADMIN_API_KEY?.trim();

  /*
   * No hardcoded fallback, ever.
   *
   * A literal default key was briefly committed here to work around the
   * lockout. That is the same failure this file was written to remove: a
   * secret in source is a secret in git history, and in every clone of it, for
   * good. An unconfigured deployment must refuse, not quietly accept a value
   * anyone can read.
   */
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
