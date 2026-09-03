import { createSessionToken, setSessionCookie, isSessionConfigured } from "./session.js";
import { findUserByEmail, isAdminUser, recordSignIn, type StoredUser } from "./store.js";
import { normalizeAuthEmail, providerLabel } from "./auth-privacy.js";

export type AuthIdentity = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  authProvider: string;
  /**
   * The provider proved this address belongs to whoever is signing in. Only a
   * verified email may open an account another provider created; otherwise
   * registering a provider account on somebody else's address would inherit it.
   */
  emailVerified?: boolean;
  geo?: { countryCode: string; region?: string | null; city?: string | null } | null;
};

export type SignInAccountDecision =
  | { ok: true; accountSub: string; linked: boolean }
  | { ok: false; status: number; error: string };

/*
 * One account per email, reachable by every provider that can prove the email.
 *
 * This used to refuse outright: an account created with Google could only ever
 * be opened with Google. When that Google OAuth client was deleted in the Cloud
 * Console, the owner had no way back in — GitHub returned 409, the account had
 * no password to sign in with, and password reset only replied "sign in with
 * Google". Four doors, every one of them pointing at the broken one.
 *
 * A provider-verified email now opens the account it already owns, and the
 * session is issued for the EXISTING account so sites, usage and outcome state
 * stay attached. A caller whose email is not provider-verified is still
 * refused, because that is the case that would let someone claim an address.
 */
export function resolveSignInAccount(input: {
  existing: Pick<StoredUser, "google_sub" | "auth_provider" | "blocked_at" | "blocked_reason"> | null;
  identity: Pick<AuthIdentity, "sub" | "emailVerified">;
}): SignInAccountDecision {
  const { existing, identity } = input;

  if (!existing || existing.google_sub === identity.sub) {
    return { ok: true, accountSub: identity.sub, linked: false };
  }

  if (existing.blocked_at) {
    return {
      ok: false,
      status: 403,
      error: existing.blocked_reason || "This account has been suspended.",
    };
  }

  if (identity.emailVerified !== true) {
    return {
      ok: false,
      status: 409,
      error: `An account already exists for this email. Sign in with ${providerLabel(existing.auth_provider)} instead.`,
    };
  }

  return { ok: true, accountSub: existing.google_sub, linked: true };
}

export function formatClientUser(input: {
  name: string;
  email: string;
  picture?: string;
  authProvider: string;
  isAdmin?: boolean;
}) {
  return {
    name: input.name || "Creator",
    email: input.email,
    avatar: input.picture
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(input.name || "Creator")}&background=f97316&color=ffffff&bold=true`,
    authProvider: input.authProvider,
    tier: "Indie Creator ($0 / mo)",
    joinedDate: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    isAdmin: input.isAdmin === true,
  };
}

export async function issueSessionResponse(
  res: any,
  identity: AuthIdentity,
  reqGeo?: AuthIdentity["geo"],
): Promise<{ ok: true; body: ReturnType<typeof formatClientUser> } | { ok: false; status: number; error: string }> {
  if (!isSessionConfigured()) {
    return { ok: false, status: 503, error: "Sign-in is not configured on this deployment." };
  }

  const email = normalizeAuthEmail(identity.email);
  if (!email) {
    return { ok: false, status: 400, error: "A valid email address is required." };
  }

  const existing = await findUserByEmail(email);
  const decision = resolveSignInAccount({ existing, identity });
  if (decision.ok === false) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  const accountSub = decision.accountSub;

  const stored: StoredUser | null = await recordSignIn({
    sub: accountSub,
    email,
    name: identity.name,
    picture: identity.picture || "",
    geo: reqGeo || identity.geo || null,
  });

  if (stored?.blocked_at) {
    return {
      ok: false,
      status: 403,
      error: stored.blocked_reason || "This account has been suspended.",
    };
  }

  const token = createSessionToken({
    sub: accountSub,
    email,
    name: identity.name,
    picture: identity.picture || "",
  });
  if (!token) {
    return { ok: false, status: 503, error: "Sign-in is not configured on this deployment." };
  }

  setSessionCookie(res, token);
  const isAdmin = await isAdminUser(accountSub);
  return {
    ok: true,
    body: formatClientUser({
      name: identity.name,
      email,
      picture: identity.picture,
      authProvider: identity.authProvider,
      isAdmin: isAdmin === true,
    }),
  };
}
