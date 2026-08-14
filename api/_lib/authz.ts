import { clearSessionCookie, getSessionUser } from "./session.js";
import { readStoredUser, type StoredUser } from "./store.js";

export type AuthenticatedSession = {
  sessionUser: ReturnType<typeof getSessionUser>;
  storedUser: StoredUser;
};

export async function requireActiveSession(req: any, res: any): Promise<
  | { ok: true; value: AuthenticatedSession }
  | { ok: false; responseSent: true }
> {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.status(401).json({ error: "Sign in to continue.", requiresAuth: true });
    return { ok: false, responseSent: true };
  }

  const storedUser = await readStoredUser(sessionUser.sub);
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
