import { clearSessionCookie, getSessionUser, type SessionUser } from "./session.js";
import { isGoldenCanaryRequest } from "./transaction-trace.js";
import { isStoreConfigured, readStoredUser, recordSignIn, type StoredUser } from "./store.js";

export type AuthenticatedSession = {
  sessionUser: ReturnType<typeof getSessionUser>;
  storedUser: StoredUser;
};

/*
 * THE ONE IDENTITY CI IS ALLOWED TO BE.
 *
 * WHY THIS EXISTS. /api/qir-runs and the rest of the durable journal require a
 * real signed session, so CI could never write to it on a deployment — which is
 * why Phase 2's exit criterion ("prove a run survives worker termination and
 * browser refresh") had only ever been demonstrated against a SYNTHETIC store.
 * It is also why the deployed golden chat records five console 401s per run: a
 * client-side /api/auth/session stub convinces the frontend and never the
 * server.
 *
 * THE BLAST RADIUS, WHICH IS THE WHOLE POINT OF DOING IT THIS WAY.
 *
 * The canary authenticates as ONE FIXED SYNTHETIC USER and nothing else. The
 * durable store partitions every row by user_sub, so a leaked canary token can
 * reach exactly this sub's Runs — never a customer's. That is the property that
 * made this preferable to putting a service-role key or a real account's
 * credentials into CI.
 *
 * FOUR PROPERTIES HOLD THIS SHUT, each asserted in authz-golden-canary.test.ts:
 *
 *   1. The identity is a CONSTANT. Nothing in the request — no header, query or
 *      body — can influence which user the canary becomes. A canary that could
 *      name its own sub would be an impersonation primitive.
 *   2. A real session always wins, so this can never downgrade or displace a
 *      signed-in user.
 *   3. isGoldenCanaryRequest compares with timingSafeEqual and returns false
 *      when the deployment has no QUANTORA_GOLDEN_CANARY_TOKEN configured, so
 *      an unconfigured deployment cannot be canary-authenticated at all.
 *   4. The sub is non-numeric and namespaced. Real subs are Google's numeric
 *      ids, so this can never collide with one.
 */
export const GOLDEN_CANARY_SUB = "quantora-golden-canary";

function goldenCanarySession(req: any): SessionUser | null {
  if (!isGoldenCanaryRequest(req)) return null;
  // Frozen and literal: the identity is not derived from the request.
  return {
    sub: GOLDEN_CANARY_SUB,
    email: "canary@quantora.invalid",
    name: "Golden Canary",
    picture: "",
  };
}

export async function requireActiveSession(req: any, res: any): Promise<
  | { ok: true; value: AuthenticatedSession }
  | { ok: false; responseSent: true }
> {
  // A real session always wins; the canary is only ever a fallback.
  const sessionUser = getSessionUser(req) || goldenCanarySession(req);
  if (!sessionUser) {
    res.status(401).json({ error: "Sign in to continue.", requiresAuth: true });
    return { ok: false, responseSent: true };
  }

  let storedUser = await readStoredUser(sessionUser.sub);
  // Unlike a real sign-in, the canary's synthetic session never passed through
  // recordSignIn. Projects/checkpoints require the users row as their owner FK;
  // authenticating only in memory made every golden save fail with HTTP 503.
  // Provision only this fixed, token-verified identity, never a caller's sub.
  if (!storedUser && sessionUser.sub === GOLDEN_CANARY_SUB && isGoldenCanaryRequest(req) && isStoreConfigured()) {
    storedUser = await recordSignIn({
      sub: GOLDEN_CANARY_SUB,
      email: "canary@quantora.invalid",
      name: "Golden Canary",
      picture: "",
    });
    if (!storedUser) {
      res.status(503).json({ error: "The golden test owner could not be stored.", reason: "canary-owner-unavailable" });
      return { ok: false, responseSent: true };
    }
  }
  if (storedUser?.blocked_at) {
    clearSessionCookie(res);
    res.status(403).json({
      error: storedUser.blocked_reason || "This account has been suspended.",
      sessionRevoked: true,
    });
    return { ok: false, responseSent: true };
  }

  return {
    ok: true,
    value: {
      sessionUser,
      storedUser: storedUser || {
        google_sub: sessionUser.sub,
        email: sessionUser.email,
        name: sessionUser.name,
        picture: sessionUser.picture,
        blocked_at: null,
        blocked_reason: null,
        is_admin: null,
      },
    },
  };
}
